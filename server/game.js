import crypto from "node:crypto";
import { ROUNDS, missFor, RESULT_GRACE_MS, computeStandings } from "./rounds.js";

const GAME_ID = "current";   // one game runs at a time; "New game" replaces it

// Fields every browser may see (ranks are private and served per player by /api/me).
export function publicState(doc) {
  if (!doc) return null;
  const { _id, ranks, endedAt, ...rest } = doc;
  return rest;
}

/**
 * Per-server-copy cache of the game state. Every copy re-reads MongoDB every POLL_MS and pushes
 * changes to its own stream listeners, so copies need no sticky sessions or shared memory.
 */
export function createGameCache({ games, players, pollMs, log }) {
  let doc = null, stateJson = "null", versionKey = "init", lastOk = 0, inflight = null;
  let ranks = { key: null, map: null };   // final ranks, loaded once per finished game
  const listeners = new Set();
  let playersCache = { gameId: null, at: 0, list: [] }, playersInflight = null;

  async function readOnce() {
    try {
      const d = await games.findOne({ _id: GAME_ID }, { projection: { ranks: 0 } });
      lastOk = Date.now();
      const vk = d ? d.gameId + ":" + d.version : "none";
      if (vk !== versionKey) {
        if (d && d.phase === "results" && ranks.key !== d.gameId + ":" + d.resultsAt) {
          const full = await games.findOne({ _id: GAME_ID }, { projection: { ranks: 1 } });
          ranks = { key: d.gameId + ":" + d.resultsAt, map: (full && full.ranks) || {} };
        }
        versionKey = vk; doc = d; stateJson = JSON.stringify(publicState(d));
        for (const fn of listeners) { try { fn(stateJson); } catch {} }
      }
    } catch (e) { log.warn({ err: e.message }, "state poll failed"); }
  }
  function rankOf(gameId, id) {
    if (!doc || doc.phase !== "results" || doc.gameId !== gameId || ranks.key !== doc.gameId + ":" + doc.resultsAt) return null;
    return ranks.map[id] || null;
  }
  // A forced refresh (after a host action) waits for any poll in flight, then reads again.
  async function refresh() {
    while (inflight) await inflight;
    inflight = readOnce();
    try { await inflight; } finally { inflight = null; }
  }
  const timer = setInterval(() => { if (!inflight) refresh(); }, pollMs);

  async function hostPlayers() {
    const gid = doc && doc.gameId;
    if (!gid) return [];
    if (playersCache.gameId === gid && Date.now() - playersCache.at < 1000) return playersCache.list;
    if (!playersInflight) {
      playersInflight = players.find({ gameId: gid }, { projection: { token: 0 } }).sort({ joinedAt: 1 }).limit(5000).toArray()
        .then(list => { playersCache = { gameId: gid, at: Date.now(), list: list.map(p => ({ id: p._id, name: p.name, times: p.times || {}, missed: p.missed || {}, joinedAt: p.joinedAt })) }; return playersCache.list; })
        .finally(() => { playersInflight = null; });
    }
    return playersInflight;
  }

  return {
    refresh, hostPlayers, rankOf,
    get doc() { return doc; },
    get json() { return stateJson; },
    get healthy() { return Date.now() - lastOk < Math.max(10000, pollMs * 10); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get listenerCount() { return listeners.size; },
    stop() { clearInterval(timer); },
  };
}

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const cleanName = s => String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
const newToken = () => crypto.randomBytes(18).toString("base64url");
const strip = p => { if (!p) return null; const { token, ...rest } = p; return rest; };

export function createGame({ games, players, cache }) {
  // id -> { token, gameId } for players this server copy has already verified (saves a read per request)
  const known = new Map();
  const sameToken = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  async function auth(id, token, needDoc) {
    if (!id || !token) throw new HttpError(401, "Missing player credentials");
    id = String(id); token = String(token);
    const k = known.get(id);
    if (k && !needDoc) { if (!sameToken(k.token, token)) throw new HttpError(401, "Unknown player"); return { _id: id, token: k.token, gameId: k.gameId }; }
    const p = await players.findOne({ _id: id });
    if (!p || !sameToken(p.token, token)) throw new HttpError(401, "Unknown player");
    known.set(id, { token: p.token, gameId: p.gameId });
    return p;
  }

  async function join({ name, playerId, token }) {
    // read the game fresh: another server copy may have opened a new game within the last poll interval
    const g = await games.findOne({ _id: GAME_ID }, { projection: { gameId: 1, phase: 1 } });
    if (!g) throw new HttpError(409, "The first mate hasn't opened the game yet");
    const nm = cleanName(name);
    if (!nm) throw new HttpError(400, "Enter a name");
    if (playerId && token) {
      try {
        const p = await auth(playerId, token, true);
        const set = p.gameId === g.gameId ? { name: nm } : { name: nm, gameId: g.gameId, joinedAt: Date.now(), times: {}, missed: {} };
        await players.updateOne({ _id: p._id }, { $set: set });
        known.set(p._id, { token: p.token, gameId: g.gameId });
        return { playerId: p._id, token: p.token, player: strip({ ...p, ...set }) };
      } catch (e) { if (!(e instanceof HttpError)) throw e; /* fall through: make a new player */ }
    }
    const doc = { _id: crypto.randomUUID(), token: newToken(), gameId: g.gameId, name: nm, joinedAt: Date.now(), times: {}, missed: {} };
    await players.insertOne(doc);
    known.set(doc._id, { token: doc.token, gameId: doc.gameId });
    return { playerId: doc._id, token: doc.token, player: strip(doc) };
  }

  // Used when a page reloads: returns the player's saved times (and rank once results are counted).
  async function me(id, token) {
    const p = await auth(id, token, true);
    return { player: strip(p), rank: cache.rankOf(p.gameId, p._id) };
  }
  // The results-moment burst: every player asks at once, so this is answered from memory.
  async function rank(id, token) {
    let p = await auth(id, token);
    if (cache.doc && p.gameId !== cache.doc.gameId) p = await auth(id, token, true);   // rejoined via another server copy
    return { rank: cache.rankOf(p.gameId, p._id) };
  }

  function roundOpen(g, idx) {
    if (!g) return false;
    if (g.phase === "round" && g.round === idx) return true;
    return (g.phase === "between" || g.phase === "results") && g.round === idx && g.endedAt && Date.now() - g.endedAt < RESULT_GRACE_MS;
  }
  async function submitResult(id, token, { round, t, missed }) {
    let p = await auth(id, token);
    const idx = ROUNDS.findIndex(R => R.key === round);
    if (idx < 0) throw new HttpError(400, "Unknown round");
    let g = cache.doc;
    if (g && p.gameId !== g.gameId) p = await auth(id, token, true);   // rejoined via another server copy
    if (!g || g.gameId !== p.gameId || !roundOpen(g, idx)) {
      g = await games.findOne({ _id: GAME_ID }, { projection: { ranks: 0 } });   // the cache may be a poll behind; check the source
      if (!g || g.gameId !== p.gameId) throw new HttpError(409, "That game is over");
      if (!roundOpen(g, idx)) throw new HttpError(409, "This challenge is closed");
    }
    const R = ROUNDS[idx];
    let time = Math.round(Number(t));
    if (missed) time = missFor(R);
    if (!Number.isFinite(time) || time <= 0 || time > missFor(R)) throw new HttpError(400, "Invalid time");
    // first answer wins: a retry or a second tab never overwrites a saved time
    const r = await players.updateOne({ _id: p._id, ["times." + round]: { $exists: false } }, { $set: { ["times." + round]: time, ["missed." + round]: !!missed } });
    if (r.modifiedCount) return { saved: { round, t: time, missed: !!missed } };
    const fresh = await players.findOne({ _id: p._id }, { projection: { times: 1, missed: 1 } });
    return { saved: { round, t: fresh.times[round], missed: !!(fresh.missed && fresh.missed[round]) } };
  }

  async function hostAction({ action, round, expect }) {
    const cur = await games.findOne({ _id: GAME_ID });
    if (action !== "new" && !cur) throw new HttpError(409, "No game is open", { state: null });
    if (action !== "new" && expect && (expect.gameId !== cur.gameId || expect.phase !== cur.phase || expect.round !== cur.round))
      throw new HttpError(409, "The game already moved on", { state: publicState(cur) });
    const now = Date.now(), ver = cur ? (cur.version || 0) : 0;
    let set;
    if (action === "new") {
      await games.replaceOne({ _id: GAME_ID }, { _id: GAME_ID, gameId: crypto.randomBytes(5).toString("hex"), phase: "lobby", round: 0, createdAt: now, version: ver + 1 }, { upsert: true });
    } else {
      if (action === "start") {
        const i = Number(round);
        if (!Number.isInteger(i) || i < 0 || i >= ROUNDS.length) throw new HttpError(400, "Unknown round");
        set = { phase: "round", round: i, roundStartedAt: now, endedAt: null };
      } else if (action === "end") {
        if (cur.phase !== "round") throw new HttpError(409, "No challenge is running", { state: publicState(cur) });
        if (cur.round === ROUNDS.length - 1) {
          const list = await players.find({ gameId: cur.gameId }, { projection: { token: 0 } }).toArray();
          const rows = computeStandings(list), ranks = {};
          rows.forEach((p, i) => { ranks[p.id] = { rank: i + 1, total: p.total }; });
          set = { phase: "results", endedAt: now, resultsAt: now, ranks, totalPlayers: rows.length, reveal: 0, published: false,
            top: rows.slice(0, 10).map(p => ({ name: p.name, total: p.total, solved: p.solved })) };
        } else set = { phase: "between", endedAt: now };
      } else if (action === "reveal") {
        set = { reveal: Math.min(Math.min(3, (cur.top || []).length), (cur.reveal || 0) + 1) };
      } else if (action === "publish") {
        set = { reveal: Math.min(3, (cur.top || []).length), published: true };
      } else throw new HttpError(400, "Unknown action");
      const r = await games.updateOne({ _id: GAME_ID, version: ver }, { $set: set, $inc: { version: 1 } });
      if (!r.matchedCount) throw new HttpError(409, "The game changed at the same moment; try again", { state: publicState(await games.findOne({ _id: GAME_ID })) });
    }
    await cache.refresh();
    return { state: JSON.parse(cache.json) };
  }

  return { join, me, rank, submitResult, hostAction };
}
