// Full-game load test: N simulated players + a simulated first mate play a real game end to end.
//
//   node loadtest/simulate.js --base https://your-site --host-key <HOST_KEY> --players 300
//   node loadtest/simulate.js --base http://localhost:8081,http://localhost:8082 --host-key ... --players 300 --round-secs 20
//
// Several --base URLs (comma-separated) spread players across server copies, to prove copies stay in sync.
// WARNING: it starts a NEW GAME on the target server. Never point it at a server during a real event.
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]]) : a), []));
const BASES = (args.base || "http://localhost:8080").split(",").map(s => s.replace(/\/$/, ""));
const HOST_KEY = args["host-key"] || process.env.HOST_KEY;
const N = Number(args.players || 300), RAMP = Number(args.ramp || 30) * 1000;
const ROUND_MS = Number(args["round-secs"] || 40) * 1000, BETWEEN_MS = Number(args["between-secs"] || 6) * 1000;
const ROUND_KEYS = ["r1", "r2", "r3", "r4", "r5"];
if (!HOST_KEY) { console.error("Pass --host-key (the server's HOST_KEY)."); process.exit(1); }

/* ---------- metrics ---------- */
const lat = {}, errors = {}, fanout = [];
let streamsOpen = 0, streamDrops = 0, streamPeak = 0;
const rec = (name, ms) => (lat[name] = lat[name] || []).push(ms);
const err = (name, what) => { const k = name + " → " + what; errors[k] = (errors[k] || 0) + 1; };
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
async function call(name, base, method, p, body, headers) {
  const t0 = performance.now();
  try {
    const r = await fetch(base + p, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text(); rec(name, performance.now() - t0);
    if (!r.ok) { err(name, r.status); return { ok: false, status: r.status, data: safeJson(txt) }; }
    return { ok: true, status: r.status, data: safeJson(txt) };
  } catch (e) { rec(name, performance.now() - t0); err(name, e.cause?.code || e.message); return { ok: false, status: 0 }; }
}
const safeJson = t => { try { return JSON.parse(t); } catch { return null; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- SSE client (no dependencies) ---------- */
async function stream(base, onState, signal) {
  while (!signal.aborted) {
    try {
      const r = await fetch(base + "/api/stream", { signal, headers: { accept: "text/event-stream" } });
      streamsOpen++; streamPeak = Math.max(streamPeak, streamsOpen); const connectedAt = Date.now();
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = "message", data = "";
          for (const line of chunk.split("\n")) { if (line.startsWith("event:")) ev = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
          if (ev === "state" && data) onState(JSON.parse(data), connectedAt);
        }
      }
      streamsOpen--; if (!signal.aborted) { streamDrops++; await sleep(1000); }
    } catch (e) { if (signal.aborted) return; streamsOpen = Math.max(0, streamsOpen - 1); streamDrops++; err("stream", e.cause?.code || e.message); await sleep(1500); }
  }
}

/* ---------- the first mate ---------- */
const actionAt = {};   // state version -> when the host sent the action that produced it
let G = null, lastSent = 0;
async function hostAction(action, extra) {
  const sent = Date.now(); lastSent = sent;
  const r = await call("host/action:" + action, BASES[0], "POST", "/api/host/action", { action, ...(extra || {}), expect: G ? { gameId: G.gameId, phase: G.phase, round: G.round } : null }, { "x-host-key": HOST_KEY });
  if (r.data && r.data.state) { G = r.data.state; actionAt[G.version] = sent; }
  else console.error("host action failed", action, r.status, r.data);
  return r;
}

/* ---------- a player ---------- */
const playersOut = [];
async function player(i, ctl) {
  const base = BASES[i % BASES.length];
  const me = { i, base, id: null, token: null, submitted: {}, won: {}, seen: new Set(), rank: null };
  playersOut.push(me);
  await sleep(rand(0, RAMP));
  for (const f of ["/", "/js/core.js", "/js/app.js", "/captain.jpg"]) await call("page load", base, "GET", f);
  let state = null;
  const onState = (s, connectedAt) => {
    state = s; if (!s) return;
    const v = s.gameId + ":" + s.version;
    // delivery delay: only for changes the host made while this stream was already open
    if (!me.seen.has(v)) { me.seen.add(v); if (me.seen.size > 1 && lastSent > connectedAt) fanout.push(Date.now() - lastSent); }
    if (s.phase === "round" && me.id) {
      const rk = ROUND_KEYS[s.round];
      if (!(rk in me.submitted) && !me["sched" + rk]) {
        me["sched" + rk] = true;
        // the portrait is only open to pirates who won all four islands
        const locked = rk === "r5" && !["r1", "r2", "r3", "r4"].every(k => me.won[k]);
        const skip = locked || Math.random() < .08;                    // ~8% never finish a round
        const missed = !skip && Math.random() < .05;          // ~5% run out of time
        const delay = rand(1500, Math.min(ROUND_MS - 2000, 18000));
        if (!skip) setTimeout(async () => {
          const t = Math.round(rand(4000, 85000));
          const r = await call("result", base, "POST", "/api/result", { round: rk, t, missed }, { "x-player-id": me.id, "x-player-token": me.token });
          if (r.ok) { me.submitted[rk] = r.data.saved.t; me.won[rk] = !r.data.saved.missed; }
        }, delay);
      }
    }
    if (s.phase === "results" && me.id && !me.rankAsked) { me.rankAsked = true;
      setTimeout(async () => { const r = await call("rank", base, "GET", "/api/rank", null, { "x-player-id": me.id, "x-player-token": me.token }); if (r.ok) me.rank = r.data.rank; }, rand(0, 3000)); }
  };
  stream(base, onState, ctl.signal);
  const j = await call("join", base, "POST", "/api/join", { name: "Pirate " + (i + 1) });
  if (j.ok) { me.id = j.data.playerId; me.token = j.data.token; }
  if (Math.random() < .1) { await sleep(rand(1000, 5000)); await call("me (reload)", base, "GET", "/api/me", null, { "x-player-id": me.id, "x-player-token": me.token }); }
}

/* ---------- run ---------- */
const ctl = new AbortController();
const started = Date.now();
console.log(`Load test: ${N} players over ${RAMP / 1000}s on ${BASES.join(", ")}; rounds open ${ROUND_MS / 1000}s`);
await hostAction("new");
const hostPoll = setInterval(() => call("host/players", BASES[0], "GET", "/api/host/players", null, { "x-host-key": HOST_KEY }), 1500);
const all = Array.from({ length: N }, (_, i) => player(i, ctl));
await sleep(RAMP + 3000);
for (let r = 0; r < ROUND_KEYS.length; r++) {
  await hostAction("rules", { round: r }); await sleep(2000);
  await hostAction("start", { round: r }); console.log(`  round ${r + 1} started (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  await sleep(ROUND_MS);
  await hostAction("end");
  await sleep(BETWEEN_MS);
}
for (let k = 0; k < 3; k++) { await hostAction("reveal"); await sleep(800); }
await hostAction("captain"); await sleep(800);
await hostAction("publish");
await sleep(5000);
clearInterval(hostPoll);

/* ---------- verify the data ---------- */
const hp = await call("host/players", BASES[0], "GET", "/api/host/players", null, { "x-host-key": HOST_KEY });
const byId = new Map((hp.data?.players || []).map(p => [p.id, p]));
let joinedOk = 0, timeMismatch = 0, missingSaved = 0, rankMissing = 0;
for (const me of playersOut) {
  if (!me.id) continue; joinedOk++;
  const p = byId.get(me.id); if (!p) { missingSaved++; continue; }
  for (const [rk, t] of Object.entries(me.submitted)) if (p.times[rk] !== t) timeMismatch++;
  if (!me.rank) rankMissing++;
}
const finalState = (await call("state", BASES[0], "GET", "/api/state")).data;
ctl.abort();
await Promise.allSettled(all);

const rows = Object.entries(lat).map(([k, v]) => ({ endpoint: k, count: v.length, p50: +pct(v, 50).toFixed(0), p95: +pct(v, 95).toFixed(0), p99: +pct(v, 99).toFixed(0), max: +Math.max(...v).toFixed(0) }));
const summary = {
  target: BASES, players: N, durationSec: Math.round((Date.now() - started) / 1000),
  streams: { peakOpen: streamPeak, drops: streamDrops },
  hostActionToPlayerMs: { samples: fanout.length, p50: pct(fanout, 50), p95: pct(fanout, 95), p99: pct(fanout, 99), max: fanout.length ? Math.max(...fanout) : 0 },
  checks: { joined: joinedOk, savedPlayersFound: byId.size, missingSaved, timeMismatch, rankMissing, resultsTotalPlayers: finalState?.totalPlayers, published: finalState?.published },
  errors, latencyMs: rows,
};
console.table(rows);
console.log(JSON.stringify({ ...summary, latencyMs: undefined }, null, 2));
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "results");
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, "run-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
fs.writeFileSync(file, JSON.stringify(summary, null, 2));
console.log("Saved", file);
const pass = joinedOk === N && missingSaved === 0 && timeMismatch === 0 && rankMissing === 0 && finalState?.totalPlayers === N && !Object.keys(errors).some(k => !k.startsWith("stream"));
console.log(pass ? "PASS" : "CHECK THE NUMBERS ABOVE");
process.exit(pass ? 0 : 2);
