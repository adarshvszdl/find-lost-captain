import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { connectDb } from "./db.js";
import { createGameCache, createGame, HttpError } from "./game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const HOST_KEY = process.env.HOST_KEY || "";
const POLL_MS = Number(process.env.POLL_MS || 500);
if (!HOST_KEY || HOST_KEY.length < 8) { console.error("Set HOST_KEY (at least 8 characters): it is the first mate's password."); process.exit(1); }

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" }, disableRequestLogging: true, bodyLimit: 4096, trustProxy: true, forceCloseConnections: true });
const { client, games, players } = await connectDb({ uri: process.env.MONGODB_URI, dbName: process.env.MONGODB_DB, poolSize: Number(process.env.MONGO_POOL || 40) });
const cache = createGameCache({ games, players, pollMs: POLL_MS, log: app.log });
await cache.refresh();
const game = createGame({ games, players, cache });

const hostOk = req => {
  const k = String(req.headers["x-host-key"] || "");
  return k.length === HOST_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(HOST_KEY));
};
const requireHost = (req) => { if (!hostOk(req)) throw new HttpError(401, "Wrong first mate's password"); };
const playerHeaders = req => [req.headers["x-player-id"], req.headers["x-player-token"]];

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...(err.extra || {}) });
  if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: "Bad request" });
  if (err.statusCode === 413) return reply.code(413).send({ error: "Request too large" });
  req.log.error(err);
  reply.code(500).send({ error: "Server error" });
});

/* ---------- health ---------- */
app.get("/healthz", async (req, reply) => {
  if (!cache.healthy) return reply.code(503).send({ ok: false, db: "unreachable" });
  return { ok: true, streams: cache.listenerCount };
});

/* ---------- game state ---------- */
app.get("/api/state", async (req, reply) => { reply.header("cache-control", "no-store").type("application/json"); return cache.json; });

// Server-Sent Events: pushes the full public state whenever it changes, plus a ping every 15 s.
app.get("/api/stream", (req, reply) => {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  res.write("retry: 3000\n\n");
  res.write("event: state\ndata: " + cache.json + "\n\n");
  const off = cache.subscribe(json => res.write("event: state\ndata: " + json + "\n\n"));
  const ping = setInterval(() => res.write("event: ping\ndata: " + Date.now() + "\n\n"), 15000);
  req.raw.on("close", () => { off(); clearInterval(ping); });
});

/* ---------- players ---------- */
app.post("/api/join", async req => game.join(req.body || {}));
app.get("/api/me", async (req, reply) => { reply.header("cache-control", "no-store"); return game.me(...playerHeaders(req)); });
app.get("/api/rank", async (req, reply) => { reply.header("cache-control", "no-store"); return game.rank(...playerHeaders(req)); });
app.post("/api/result", async req => game.submitResult(...playerHeaders(req), req.body || {}));

/* ---------- first mate ---------- */
app.post("/api/host/login", async req => { requireHost(req); return { ok: true }; });
app.get("/api/host/players", async (req, reply) => { requireHost(req); reply.header("cache-control", "no-store"); return { now: Date.now(), players: await cache.hostPlayers() }; });
app.post("/api/host/action", async req => { requireHost(req); return game.hostAction(req.body || {}); });

/* ---------- the game page ---------- */
await app.register(fastifyStatic, {
  root: path.join(__dirname, "..", "public"),
  setHeaders(res, file) { res.setHeader("cache-control", /\.(html)$/.test(file) ? "no-cache" : "public, max-age=3600"); },
});

const shutdown = async sig => {
  app.log.info({ sig }, "shutting down");
  cache.stop();
  try { await app.close(); } catch {}
  try { await client.close(); } catch {}
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.server.keepAliveTimeout = 65000;   // longer than the AWS load balancer's idle timeout
app.server.headersTimeout = 66000;
await app.listen({ port: PORT, host: "0.0.0.0" });
