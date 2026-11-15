/* The Search for Our Long-Lost Captain — browser app.
   Talks to the Node server: SSE stream for live game state, JSON API for joining, results and first-mate actions. */

/* ---------- State ---------- */
let uid = null, isHost = false, hostKey = "", hostKeyOk = false, hostLoginErr = "", profileName = "";
const wantsHost = () => location.hash === "#host";
let G = null, gameLoaded = false, gameSlow = false;
let myDoc = null, myLoaded = false, myRank = null, rankFor = "";
let players = [];
let viewAs = "auto";
let joinErr = "", writeErr = "", confirmReset = false, hostBusy = false, toolsOpen = false, keyOpen = false;
const submitted = {};
let currentKey = "", cleanups = [], hostScreenKey = "", hostTimerIv = null, clockSkew = 0;
const serverTime = () => Date.now() + clockSkew;

function joined() { return !!(G && myDoc && myDoc.gameId === G.gameId); }
function myResult(rk) {
  const local = submitted[G.gameId + ":" + rk];
  if (local) return local;
  if (joined() && myDoc.times && myDoc.times[rk] != null) return { t: myDoc.times[rk], missed: !!(myDoc.missed && myDoc.missed[rk]) };
  return null;
}
function earnedRows(upto) {
  return ALL_ROWS.filter(i => { if (i > upto) return false; const res = myResult(ROUNDS[i].key); return res && !res.missed; });
}
const FINAL = ROUNDS.length - 1;
// Only pirates who won all four islands hold all nine pieces, so only they can assemble the portrait.
const canAssemble = () => earnedRows(FINAL - 1).length === ALL_ROWS.length;
const assembledIt = () => { const res = G && myResult(ROUNDS[FINAL].key); return !!(res && !res.missed); };
// The face stays hidden behind the big reveal; it shows on the page underneath only once that screen's reveal is closed.
const capKey = mode => "llc2:" + (G && G.gameId) + ":capClosed:" + mode;
const capDone = mode => !!(G && G.captain && (capClosed[capKey(mode)] || lsGet(capKey(mode))));
const seesCaptain = () => assembledIt() || capDone("player");
function roundEnded(i) {
  if (!G || G.phase === "lobby") return false;
  return i < G.round || (i === G.round && (G.phase === "between" || G.phase === "results"));
}

/* ---------- Server API ---------- */
const API = {
  async req(method, path, body, headers) {
    const r = await fetch(path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    let data = null; try { data = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((data && data.error) || "HTTP " + r.status); e.status = r.status; e.data = data; throw e; }
    return data;
  },
};
let pid = lsGet("llc:pid"), ptok = lsGet("llc:tok");
const playerAuth = () => ({ "x-player-id": pid || "", "x-player-token": ptok || "" });
async function joinGame(name) {
  const r = await API.req("POST", "/api/join", { name, playerId: pid || undefined, token: ptok || undefined });
  pid = r.playerId; ptok = r.token; uid = pid; lsSet("llc:pid", pid); lsSet("llc:tok", ptok); myDoc = r.player;
}
async function submitResult(rk, t, missed) {
  const r = await API.req("POST", "/api/result", { round: rk, t, missed }, playerAuth());
  if (r && r.saved && myDoc) { myDoc.times = { ...(myDoc.times || {}), [rk]: r.saved.t }; myDoc.missed = { ...(myDoc.missed || {}), [rk]: r.saved.missed }; }
}
async function loadMe() {
  if (pid && ptok) {
    try { const r = await API.req("GET", "/api/me", null, playerAuth()); myDoc = r.player; uid = pid; myRank = r.rank || null; }
    catch (e) { if (e.status === 401) { pid = ptok = null; lsSet("llc:pid", ""); lsSet("llc:tok", ""); } }
  }
  myLoaded = true;
}
async function refreshRank(attempt) {
  attempt = attempt || 0;
  try { const r = await API.req("GET", "/api/rank", null, playerAuth()); myRank = r.rank || null; } catch {}
  if (!myRank && attempt < 4) { setTimeout(() => refreshRank(attempt + 1), 1500 + Math.random() * 1500); return; }
  currentKey = ""; render();
}
function applyState(s) {
  G = s; gameLoaded = true; gameSlow = false;
  if (G && G.phase === "results" && joined()) { const k = G.gameId + ":" + G.resultsAt; if (rankFor !== k) { rankFor = k; refreshRank(); } }
}
function connectStream() {
  let lastMsg = 0;
  if (window.EventSource) {
    const es = new EventSource("/api/stream");
    es.addEventListener("state", e => { lastMsg = Date.now(); try { applyState(JSON.parse(e.data)); } catch {} render(); });
    es.addEventListener("ping", () => { lastMsg = Date.now(); });
  }
  // Fallback for networks that block streaming: poll if the stream has been quiet for 20 s.
  setInterval(async () => {
    if (Date.now() - lastMsg < 20000) return;
    try { const s = await API.req("GET", "/api/state"); lastMsg = Date.now(); applyState(s); render(); } catch {}
  }, 4000);
}
async function pollPlayers() {
  if (!isHost) return;
  try {
    const t0 = Date.now(), r = await API.req("GET", "/api/host/players", null, { "x-host-key": hostKey });
    clockSkew = r.now - Math.round((t0 + Date.now()) / 2);
    players = r.players || []; scheduleRender();
  } catch (e) { if (e.status === 401) { hostKeyOk = false; updateHostMode(); currentKey = ""; render(true); } }
}
async function hostLogin(key) {
  await API.req("POST", "/api/host/login", null, { "x-host-key": key });
  hostKey = key; hostKeyOk = true; lsSet("llc:hostkey", key);
}
function updateHostMode() { isHost = wantsHost() && hostKeyOk; }
const wantsStage = () => location.hash === "#stage";

/* ---------- Boot ---------- */
async function boot() {
  hostKey = lsGet("llc:hostkey") || "";
  if (hostKey) { try { await API.req("POST", "/api/host/login", null, { "x-host-key": hostKey }); hostKeyOk = true; } catch { hostKeyOk = false; } }
  updateHostMode();
  addEventListener("hashchange", () => { updateHostMode(); viewAs = "auto"; currentKey = ""; if (isHost) pollPlayers(); if (wantsStage()) pollStage(); render(true); });
  setTimeout(() => { if (!gameLoaded) { gameSlow = true; currentKey = ""; render(); } }, 10000);
  await loadMe();
  connectStream();
  setInterval(() => { if (isHost) pollPlayers(); if (wantsStage()) pollStage(); }, 1500);
  if (isHost) pollPlayers();
  if (wantsStage()) pollStage();
  render();
}
let renderPending = false, lastRender = 0;
function scheduleRender() {
  if (renderPending) return; renderPending = true;
  setTimeout(() => { renderPending = false; render(true); }, Math.max(0, 400 - (Date.now() - lastRender)));
}

/* ---------- Render dispatch ---------- */
function render(force) {
  lastRender = Date.now();
  syncCaptainReveal();
  if (wantsHost() && !hostKeyOk) {
    const k = "hostlogin:" + hostLoginErr;
    if (currentKey === k) return;
    currentKey = k; cleanups.forEach(f => f()); cleanups = [];
    $ui.replaceChildren(hostLoginScreen()); measurePad(); return;
  }
  if (wantsStage()) {   // view-only: rebuild only when the step changes; numbers update in place
    const k = stageKey();
    if (k === currentKey) { updateStage(); return; }
    currentKey = k; cleanups.forEach(f => f()); cleanups = [];
    $ui.replaceChildren(renderStage()); updateStage(); return;
  }
  const hostMode = isHost && viewAs !== "player";
  const key = hostMode ? "host:" + Date.now() : playerKey();
  if (!hostMode && key === currentKey) return;
  currentKey = key;
  cleanups.forEach(f => f()); cleanups = [];
  $ui.replaceChildren(hostMode ? renderHost() : renderPlayer());
  measurePad();
}
function measurePad() {
  requestAnimationFrame(() => {
    const el = $ui.querySelector("[data-pad]:not([hidden])");
    World.set({ pad: el ? Math.min(el.getBoundingClientRect().height + 24, innerHeight * .78) : 0 });
  });
}
addEventListener("resize", measurePad);
function hostLoginScreen() {
  const input = h("input", { type: "password", id: "host-key", class: "field", placeholder: "First mate's password", autocomplete: "current-password" });
  const btn = h("button", { class: "gbtn green big", type: "submit" }, "Take the helm");
  const err = h("p", { class: "err", text: hostLoginErr });
  const form = h("form", { class: "card", style: "width:min(480px,100%);display:grid;gap:12px", onsubmit: async ev => {
    ev.preventDefault(); btn.disabled = true;
    try { await hostLogin(input.value.trim()); hostLoginErr = ""; updateHostMode(); currentKey = ""; pollPlayers(); render(true); }
    catch (e) { hostLoginErr = e.status === 401 ? "That password isn't right." : "Couldn't check the password: " + e.message; btn.disabled = false; err.textContent = hostLoginErr; }
  } },
    h("label", { for: "host-key", class: "label", text: "First mate's page" }),
    h("p", { class: "strong", text: "Enter the first mate's password to run the game." }),
    input, btn, err,
    h("button", { class: "gbtn small plain", type: "button", onclick: () => { location.hash = ""; } }, "Go to the player page"));
  return titleScreen(form);
}

/* ---------- UI building blocks ---------- */
function logo(small) {
  return h("div", { class: "logo" + (small ? " sm" : "") }, h("div", { class: "logo-kicker", text: "The search for our" }), h("div", { class: "logo-main", text: "Long-Lost Captain" }), h("div", { class: "logo-sub", text: "A pirate adventure" }));
}
function screen(...kids) {
  return h("div", { class: "screen" }, isHost && viewAs === "player" ? h("button", { class: "gbtn small plain back-host", onclick: () => { viewAs = "auto"; currentKey = ""; render(true); } }, "Back to first mate's screen") : null, ...kids);
}
const grow = () => h("div", { class: "grow" });
function titleScreen(bottom) { worldIdle(); return screen(grow(), logo(false), grow(), bottom ? h("div", { class: "dock", "data-pad": "" }, bottom) : null); }
function card(kids, cls) { return h("div", { class: "card " + (cls || ""), style: "width:min(560px,100%);display:grid;gap:14px" }, kids); }
function sheet(ribbon, kids, opts) {
  opts = opts || {};
  return h("div", { class: "sheet-wrap" + (opts.wide ? " wide" : "") + (opts.side ? " side" : "") + (opts.enter ? " enter" : "") },
    h("div", { class: "ribbon" + (opts.color ? " " + opts.color : ""), text: ribbon }),
    h("section", { class: "card sheet" }, kids));
}
function dock(...kids) { return h("div", { class: "dock", "data-pad": "" }, ...kids); }
function dialogBox(text, extra) {
  return h("div", { class: "dlg" }, h("div", { class: "dlg-name", text: "Ship's log" }), typeof text === "string" ? h("p", { class: "dlg-text", text }) : text, extra || null);
}
function liveChip(text) { return h("span", { class: "chip live" }, h("span", { class: "dot" }), text); }
function errLine() { return h("p", { class: "err write-err", text: writeErr || "" }); }
function showErr() { document.querySelectorAll(".write-err").forEach(el => { el.textContent = writeErr; }); }
function worldIdle() { World.set({ ship: 0, visible: 0, cleared: 0, focus: null, zoom: 1, follow: false }); }

/* ---------- Player ---------- */
function playerKey() {
  const tag = isHost ? "|asplayer" : "";
  if (!gameLoaded || !myLoaded) return "loading" + (gameSlow ? ":slow" : "") + tag;
  if (!G) return "nogame" + tag;
  if (!joined()) return "join:" + G.gameId + ":" + joinErr + tag;
  const r = G.round, rk = ROUNDS[r] && ROUNDS[r].key;
  if (G.phase === "lobby") return "lobby:" + G.gameId + tag;
  if ((G.phase === "rules" || G.phase === "round") && r === FINAL && !canAssemble()) return "locked:" + G.gameId + tag;
  if (G.phase === "rules") return "rules:" + G.gameId + ":" + r + tag;
  if (G.phase === "round" && !myResult(rk)) return "play:" + G.gameId + ":" + r + tag;
  if (G.phase === "round" || G.phase === "between") return "after:" + G.gameId + ":" + r + ":" + !!myResult(rk) + tag;
  if (G.phase === "results") return "results:" + G.gameId + ":" + (G.resultsAt || 0) + ":" + !!G.published + ":" + seesCaptain() + tag;
  return "unknown" + tag;
}
function renderPlayer() {
  if (!gameLoaded || !myLoaded) return titleScreen(dialogBox(gameSlow ? "The map isn't loading yet. Check your connection; this page keeps trying." : "Unrolling the map…"));
  if (!G) return titleScreen(dialogBox("The first mate hasn't opened the game yet. Keep this page open; it updates by itself."));
  if (!joined()) return renderJoin();
  const r = G.round, R = ROUNDS[r];
  if (G.phase === "lobby") return renderLobby();
  if ((G.phase === "rules" || G.phase === "round") && r === FINAL && !canAssemble()) return renderLocked();
  if (G.phase === "rules") return renderRules(r);
  if (G.phase === "round" && !myResult(R.key)) return renderPlay(r);
  if (G.phase === "round" || G.phase === "between") return renderAfter(r);
  if (G.phase === "results") return renderPlayerResults();
  return titleScreen(dialogBox("Waiting for the first mate."));
}
function islandPips() {
  return h("div", { class: "pips", role: "img", "aria-label": "Voyage progress" }, [0, 1, 2, 3, 4].map(i => {
    const R = ROUNDS[i], done = roundEnded(i) || !!(G && G.phase !== "lobby" && i <= G.round && myResult(R.key));
    const now = !done && G && (G.phase === "rules" || G.phase === "round" || G.phase === "between") && G.round === i;
    return h("span", { class: "pip" + (done ? " done" : now ? " now" : ""), title: R.title }, i < 4 ? String(i + 1) : "★");
  }));
}
function playerHud(pieces) {
  const name = (joined() && myDoc.name) || "Pirate";
  const cnt = h("span", { text: pieces + "/" + GRID * GRID });
  const pc = h("span", { class: "chip", title: "Portrait pieces collected" }, h("span", { class: "mini-portrait" }), cnt);
  const el = h("div", { class: "hud" }, h("span", { class: "chip" }, h("span", { class: "dot", text: name.trim().charAt(0).toUpperCase() || "P" }), h("span", { class: "chip-name", text: name })), islandPips(), pc);
  el.setPieces = n => { cnt.textContent = n + "/" + GRID * GRID; pc.classList.remove("bump"); void pc.offsetWidth; pc.classList.add("bump"); };
  return el;
}
function renderJoin() {
  worldIdle();
  const input = h("input", { type: "text", id: "pirate-name", class: "field", maxlength: "40", placeholder: "Your pirate name", autocomplete: "off" });
  input.value = lsGet("llc2:name") || profileName || "";
  const btn = h("button", { class: "gbtn green big", type: "submit" }, "Join the crew");
  const err = h("p", { class: "err", text: joinErr });
  const form = h("form", { class: "card", style: "width:min(480px,100%);display:grid;gap:12px", onsubmit: async ev => {
    ev.preventDefault();
    const name = input.value.trim().slice(0, 40);
    if (!name) { err.textContent = "Enter a name so the crew knows who you are."; return; }
    btn.disabled = true; lsSet("llc2:name", name);
    try { await joinGame(name); joinErr = ""; currentKey = ""; render(); }
    catch (e) {
      joinErr = "Couldn't join: " + e.message + ". Try again.";
      btn.disabled = false; err.textContent = joinErr;
    }
  } }, h("label", { for: "pirate-name", class: "label", text: "Your name on the crew list" }), input, btn, err);
  return screen(grow(), logo(false), grow(), dock(form));
}
function renderLobby() {
  worldIdle();
  return screen(playerHud(0), grow(), dock(dialogBox(STORY, liveChip("You're aboard! Waiting for the first mate to set sail."))));
}

/* Before each challenge the first mate shows its rules; players wait here until the first mate starts it. */
function renderRules(r) {
  const R = ROUNDS[r];
  World.set({ visible: Math.min(r, 4), cleared: r, focus: r, zoom: "fit", follow: false });
  World.sail(r, r + 1, G.gameId + ":arrive:" + r);
  const rules = [...R.rules, "You have " + capText(R) + ". Your clock starts when the challenge appears."];
  return screen(playerHud(piecesUpTo(earnedRows(r - 1))), grow(), dock(sheet(R.title, [
    h("div", { class: "sheet-head" }, h("div", { class: "sub", text: R.type === "puzzle" ? "Final challenge" : "Island " + (r + 1) + " of 4" }), h("div", { class: "sub", text: "Rules" })),
    targetCard(R),
    h("ul", { class: "rules" }, rules.map(t => h("li", { text: t }))),
    h("div", { class: "intro-foot" }, liveChip("Get ready! The first mate will start the challenge.")),
  ], { color: "navy", enter: true })));
}

/* The final challenge for a pirate who lost an island: no full set of pieces, so they wait for the reveal. */
function renderLocked() {
  const won = earnedRows(FINAL - 1), have = piecesUpTo(won), lost = ALL_ROWS.length - won.length;
  World.set({ visible: 4, cleared: 4, focus: 4, zoom: "fit", follow: false });
  World.sail(FINAL, FINAL + 1, G.gameId + ":arrive:" + FINAL);
  return screen(playerHud(have), grow(), dock(sheet("Out of the race", [
    h("div", { class: "res-grid" }, portrait(G.gameId, won, false),
      h("div", { style: "display:grid;gap:8px" },
        h("div", { class: "label", text: "Portrait pieces" }), h("div", { class: "big-time", text: have + " of " + GRID * GRID }),
        h("p", { class: "strong", text: "You lost " + (lost === 1 ? "an island" : lost + " islands") + " on the way, so you can't assemble the captain's portrait." }),
        h("p", { class: "muted small", text: "Stay on this screen. The first mate will reveal the winners and the captain's face soon." }))),
  ], { color: "navy", enter: true })));
}
/* The portrait at the results: face-down until the first mate reveals the captain (or you assembled it yourself). */
function resultsPortrait() { return portrait(G.gameId, ALL_ROWS, seesCaptain()); }

/* The big reveal: when the first mate reveals the captain, every screen (host, winners, the lost) gets this
   full-screen moment. It lives outside #ui so the host's frequent re-renders don't restart it. */
const capClosed = {};
function syncCaptainReveal() {
  const on = !!(G && G.phase === "results" && G.captain), gid = on ? G.gameId : "";
  const stageMode = wantsStage(), hostMode = !stageMode && isHost && viewAs !== "player", mode = stageMode ? "stage" : hostMode ? "host" : "player";
  const closedKey = capKey(mode);
  let el = document.getElementById("cap-reveal");
  if (!on || capClosed[closedKey] || lsGet(closedKey)) { if (el) el.remove(); return; }
  const me = myRank;
  const line = stageMode ? "The crew is whole again!" : hostMode ? "The crew is whole again. Ahoy, Captain!"
    : me && me.rank ? "You found the captain and finished " + ordinal(me.rank) + " of " + G.totalPlayers + "!"
    : "Lost at sea this time, but the captain is home and the crew is whole again!";
  if (el && el.dataset.k === gid + mode) { el.querySelector(".cap-line").textContent = line; return; }   // the rank may arrive mid-animation
  if (el) el.remove();
  const seenKey = "llc2:" + gid + ":capSeen:" + mode, seen = !!lsGet(seenKey);
  lsSet(seenKey, 1);
  const order = revealOrder(gid), delay = i => (0.9 + order.indexOf(i) * 0.28).toFixed(2) + "s";
  const cover = portrait(gid, ALL_ROWS, false);
  cover.classList.add("cap-cover");
  cover.querySelectorAll("svg > g").forEach((g, i) => { g.style.animationDelay = delay(i); });
  const close = () => { capClosed[closedKey] = true; lsSet(closedKey, 1); el.classList.add("out"); setTimeout(() => el.remove(), 500); currentKey = ""; render(); };
  el = h("div", { id: "cap-reveal", class: "overlay cap-reveal" + (seen ? " done" : ""), role: "dialog", "aria-label": "The lost captain is revealed" },
    h("div", { class: "rays on" }),
    h("div", { class: "cap-kicker", text: "Our long-lost captain is…" }),
    h("div", { class: "cap-stage" }, portrait(gid, ALL_ROWS, true), cover),
    h("div", { class: "big-word sun cap-found", text: "Found!" }),
    h("p", { class: "cap-line", text: line }),
    stageMode ? null : h("button", { class: "gbtn big cap-close", onclick: close }, hostMode ? "Back to the results" : "See the standings"));
  el.dataset.k = gid + mode;
  document.body.append(el);
}

function renderPlay(r) {
  const R = ROUNDS[r], gid = G.gameId, cap = capFor(R);
  const lsKey = "llc2:" + gid + ":" + R.key;
  let start = Number(lsGet(lsKey));
  if (!start) { start = Date.now(); lsSet(lsKey, start); }
  const startPerf = performance.now() - Math.max(0, Date.now() - start);
  let penalty = Number(lsGet(lsKey + ":p") || 0), done = false;
  const timerEl = h("div", { class: "timer-pill", text: "0.0s" }), penEl = h("div", { class: "pen" });
  const raw = () => performance.now() - startPerf, total = () => raw() + penalty;
  const iv = setInterval(() => { if (done) return; timerEl.textContent = clock(total()); if (raw() >= cap) finish(true); }, 50);
  cleanups.push(() => clearInterval(iv));
  const api = {
    lsKey,
    penalize(ms) { penalty += ms; lsSet(lsKey + ":p", penalty); penEl.textContent = "+" + ms / 1000 + "s"; penEl.classList.remove("float"); void penEl.offsetWidth; penEl.classList.add("float"); },
    solve() { finish(false); },
  };
  function finish(missed) {
    if (done) return; done = true; clearInterval(iv);
    const t = missed ? missFor(R) : Math.round(total());
    submitted[gid + ":" + R.key] = { t, missed };
    render();   // straight into the treasure; the save runs underneath
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await submitResult(R.key, t, missed); writeErr = ""; break; }
        catch (e) {
          if (attempt === 2 || (e.status && e.status < 500 && e.status !== 429)) { writeErr = "Your time (" + fmt(t) + ") didn't save: " + e.message + ". Tell the first mate."; break; }
          await new Promise(res => setTimeout(res, 400 + Math.random() * 800));
        }
      }
      showErr();
    })();
  }
  World.set({ visible: Math.min(r, 4), cleared: r, focus: r, zoom: "fit", follow: false });
  World.sail(r, r + 1, gid + ":arrive:" + r);
  const game = { riddle: gameRiddle, torch: gameTorch, scramble: gameScramble, lock: gameLock, puzzle: gamePuzzle }[R.type](api, gid);
  const big = R.type === "torch" || R.type === "puzzle";
  const pieces = piecesUpTo(earnedRows(r - 1));
  return screen(playerHud(pieces), grow(), h("div", { class: "dock", "data-pad": "" }, sheet(R.title, [
    h("div", { class: "sheet-head" }, h("div", { class: "sub", text: R.type === "puzzle" ? "Final challenge" : "Island " + (r + 1) + " of 4" }), h("div", { class: "timer-wrap" }, timerEl, penEl)),
    game,
  ], { wide: big, enter: true })));
}

/* After an island: banner → giant clam → pieces → the ship sails on, all over the map. */
function renderAfter(r) {
  const R = ROUNDS[r], gid = G.gameId, res = myResult(R.key), won = !!(res && !res.missed);
  if (R.type === "puzzle") return renderFinale(r, res);
  const next = r + 1, nextName = ISL_NAMES[next];
  const before = piecesUpTo(earnedRows(r).filter(i => i !== r)), after = piecesUpTo(earnedRows(r));
  const seqKey = "llc2:" + gid + ":" + R.key + ":seq", seen = !!lsGet(seqKey);
  lsSet(seqKey, 1);
  const finalText = r === 3
    ? (canAssemble() ? "All four islands conquered! The ship drops anchor at Captain's Cove. Wait for the first mate's order to assemble the portrait."
      : "The ship drops anchor at Captain's Cove. You lost an island on the way, so you can't assemble the portrait. Watch the first mate's screen for the big reveal.")
    : (won ? "Land ho! We've reached " + nextName + ". Rest here until the first mate starts the next challenge." : "No treasure this time, but the voyage goes on. We've reached " + nextName + ". Wait for the first mate's order.");
  const stat = res ? (res.missed ? "Time ran out: counts as " + fmt(res.t) : R.title + " in " + fmt(res.t)) : "Not finished: counts as " + fmt(missFor(R));
  const hud = playerHud(seen ? after : before);
  const dlgText = h("p", { class: "dlg-text", text: finalText });
  const dk = dock(dialogBox(h("div", { style: "display:grid;gap:6px" }, h("div", { class: "dlg-stat", text: stat }), dlgText), errLine()));
  const scr = screen(hud, grow(), dk);
  World.set({ cleared: r + 1, zoom: "fit", follow: false });
  if (seen) { World.place(r + 2); World.set({ visible: next, focus: next }); return scr; }
  World.place(r + 1); World.set({ visible: r, focus: r });
  dk.hidden = true;
  const timers = [];
  const T = (ms, f) => timers.push(setTimeout(f, ms));
  cleanups.push(() => timers.forEach(clearTimeout));
  const banner = h("div", { class: "toast-big" }, h("div", { class: "big-word" + (won ? "" : " sun"), text: won ? "Challenge complete!" : "Time's up!" }), res ? h("div", { class: "tb-sub", text: fmt(res.t) }) : null);
  scr.append(banner);
  let ov = null;
  const land = () => { dk.hidden = false; World.set({ focus: next, follow: false }); measurePad(); };
  const skip = h("button", { class: "gbtn small plain skip", onclick: () => {
    timers.forEach(clearTimeout); banner.remove(); if (ov) ov.el.remove(); skip.remove();
    hud.setPieces(after); World.set({ visible: next }); World.place(r + 2); land();
  } }, "Skip");
  scr.append(skip);
  let at = 1500;
  if (won) {
    ov = treasureOverlay(r);
    T(1300, () => { banner.remove(); scr.insertBefore(ov.el, skip); });
    ov.steps.forEach(([ms, f]) => T(1300 + ms, f));
    T(1300 + ov.duration, () => { ov.el.classList.add("out"); hud.setPieces(after); });
    T(1300 + ov.duration + 520, () => ov.el.remove());
    at = 1300 + ov.duration + 600;
  } else T(1500, () => banner.remove());
  T(at, () => { World.set({ visible: next }); World.sail(r + 1, r + 2, gid + ":sail:" + r, () => { skip.remove(); land(); }); });
  return scr;
}
function clamSvg() {
  const topRibs = [], botRibs = [];
  for (let k = 1; k < 7; k++) { const a = Math.PI + k * Math.PI / 7; topRibs.push(s("path", { d: "M130 128 L" + (130 + Math.cos(a) * 104).toFixed(1) + " " + (128 + Math.sin(a) * 96).toFixed(1), stroke: "#d4587c", "stroke-width": "5", "stroke-linecap": "round", fill: "none" })); }
  for (let k = 1; k < 6; k++) { const a = k * Math.PI / 6; botRibs.push(s("path", { d: "M130 140 L" + (130 + Math.cos(a) * 92).toFixed(1) + " " + (140 + Math.sin(a) * 44).toFixed(1), stroke: "#b8466a", "stroke-width": "4", "stroke-linecap": "round", fill: "none" })); }
  return s("svg", { class: "clam", viewBox: "0 0 260 214", "aria-hidden": "true" },
    s("defs", null,
      s("linearGradient", { id: "clamTop", x1: "0", y1: "0", x2: "0", y2: "1" }, s("stop", { offset: "0", "stop-color": "#ffd0dc" }), s("stop", { offset: "1", "stop-color": "#f283a2" })),
      s("linearGradient", { id: "clamBot", x1: "0", y1: "0", x2: "0", y2: "1" }, s("stop", { offset: "0", "stop-color": "#f79ab3" }), s("stop", { offset: "1", "stop-color": "#c9567a" })),
      s("radialGradient", { id: "pearlG", cx: ".38", cy: ".34", r: ".7" }, s("stop", { offset: "0", "stop-color": "#ffffff" }), s("stop", { offset: ".55", "stop-color": "#eef8ff" }), s("stop", { offset: "1", "stop-color": "#a9d8ea" }))),
    s("ellipse", { cx: 130, cy: 200, rx: 104, ry: 11, fill: "rgba(10,20,40,.4)" }),
    s("g", { class: "bot" }, s("path", { d: "M16 134 Q130 236 244 134 Q130 158 16 134 Z", fill: "url(#clamBot)", stroke: "#1f2d4d", "stroke-width": "6", "stroke-linejoin": "round" }), botRibs),
    s("circle", { class: "pearl", cx: 130, cy: 128, r: 25, fill: "url(#pearlG)", stroke: "#1f2d4d", "stroke-width": "4" }),
    s("g", { class: "top" }, s("path", { d: "M16 134 Q12 30 130 20 Q248 30 244 134 Q130 114 16 134 Z", fill: "url(#clamTop)", stroke: "#1f2d4d", "stroke-width": "6", "stroke-linejoin": "round" }), topRibs,
      s("ellipse", { cx: 92, cy: 56, rx: 22, ry: 9, fill: "rgba(255,255,255,.55)", transform: "rotate(-20 92 56)" })));
}
function treasureOverlay(r) {
  const gid = G.gameId, E = edgeSigns(gid), idxs = revealOrder(gid).slice(roundStart(r), roundStart(r + 1)), n = idxs.length, rows = earnedRows(r);
  const loot = h("div", { class: "tr-loot" }, idxs.map((idx, i) => h("div", { class: "tr-piece", style: "--i:" + i },
    s("svg", { viewBox: "-30 -30 160 160", "aria-hidden": "true" }, pieceGroup(Math.floor(idx / GRID), idx % GRID, E, "back")))));
  const pic = h("div", { class: "tr-portrait" }, portrait(gid, rows.filter(i => i !== r), false));
  const el = h("div", { class: "overlay treasure", role: "dialog", "aria-label": "Treasure found" },
    h("div", { class: "rays" }),
    h("div", { class: "tr-box" }, h("div", { class: "tr-stage" }, clamSvg(), loot), pic),
    h("div", { class: "tr-text" }, h("div", { class: "big-word sun", text: n + (n === 1 ? " portrait piece!" : " portrait pieces!") }), h("p", { class: "tr-sub", text: ROUNDS[r].story })),
    h("p", { class: "tr-count" }, "The captain's portrait: ", h("strong", { text: piecesUpTo(rows) + " of " + GRID * GRID }), " pieces"));
  const add = c => () => el.classList.add(c);
  return { el, duration: 5000, steps: [[30, add("in")], [750, add("open")], [1050, add("loot")],
    [2900, () => { pic.replaceChildren(portrait(gid, rows, false, [r])); el.classList.add("frame"); }]] };
}
function renderFinale(r, res) {
  const won = !!(res && !res.missed);
  World.place(5); World.set({ visible: 4, cleared: won ? 5 : 4, focus: 4, zoom: "fit", follow: false });
  if (!won) return screen(playerHud(piecesUpTo(earnedRows(3))), grow(), dock(dialogBox(
    h("div", { style: "display:grid;gap:6px" }, h("div", { class: "dlg-stat", text: res ? "Time ran out: counts as " + fmt(res.t) : "Not finished: counts as " + fmt(missFor(ROUNDS[r])) }),
      h("p", { class: "dlg-text", text: "The first mate will reveal the captain and the winners on the main screen." })), errLine())));
  return screen(h("div", { class: "overlay finale", role: "dialog", "aria-label": "The captain is found" },
    h("div", { class: "rays on" }),
    h("div", { class: "big-word sun", text: "Portrait complete!" }),
    h("div", { class: "fin-portrait" }, portrait(G.gameId, ALL_ROWS, true)),
    h("div", { class: "big-word", text: "The captain is found!" }),
    h("p", { class: "fin-time" }, "Your time: ", h("strong", { text: fmt(res.t) })),
    liveChip("The first mate will reveal the winners on the main screen"), errLine()));
}
function renderPlayerResults() {
  const me = myRank;
  World.place(5); World.set({ visible: 4, cleared: 5, focus: 4, zoom: "fit", follow: false });
  const hud = playerHud(piecesUpTo(earnedRows(3)));
  const found = assembledIt();   // only pirates who found the captain are ranked
  if (!G.published) return screen(hud, grow(), dock(sheet(found ? "Voyage complete" : "Lost at sea", [
    h("div", { class: "res-grid" }, resultsPortrait(),
      found ? h("div", { style: "display:grid;gap:8px" }, h("div", { class: "label", text: "Your total time" }), h("div", { class: "big-time", text: me && me.total ? fmt(me.total) : "—" }),
          h("p", { class: "strong", text: "Watch the first mate's screen: the winners are about to be revealed!" }))
        : h("div", { style: "display:grid;gap:8px" },
          h("p", { class: "strong", text: "You didn't reach the captain this time, so you're not in the standings." }),
          h("p", { class: "muted small", text: "Stay here: the winners are about to be revealed, and then the captain's face." }))),
  ], { color: found ? "green" : "navy", enter: true })));
  return screen(hud, grow(), dock(sheet("Final standings", [
    h("div", { style: "width:min(170px,60%);margin:0 auto" }, resultsPortrait()),
    me && me.rank ? h("div", { style: "display:grid;gap:8px;justify-items:center;text-align:center" }, h("div", { class: "label", text: "You finished" }), h("div", { class: "medal-big", text: ordinal(me.rank) }),
      h("p", { class: "strong" }, "of " + G.totalPlayers + " pirates who found the captain · total ", h("span", { style: "font-family:var(--f-display);font-weight:400;font-size:1.2rem", text: fmt(me.total) })))
      : h("p", { class: "strong", style: "text-align:center", text: "Lost at sea: only pirates who found the captain are ranked." }),
    (G.top || []).length ? topTable(G.top.slice(0, 10).map(p => ({ name: p.name, total: p.total })), false) : h("p", { class: "muted", text: "No pirate found the captain this time." }),
  ], { color: "green", enter: true })));
}
function topTable(rows, live) {
  return h("div", { class: "table-wrap" }, h("table", { class: "ledger" }, rows.map((p, i) => h("tr", null,
    h("td", { style: "width:36px" }, h("span", { class: "medal " + (i < 3 ? "m" + (i + 1) : "mn"), text: i + 1 })),
    h("td", { class: "nm" }, p.name, live && p.doneNow ? h("span", { class: "tick", text: " ✓" }) : null),
    h("td", { class: "r", text: p.total == null ? "—" : fmt(p.total) })))));
}

/* ---------- First mate (host) ---------- */
function standings() {
  return players.map(p => {
    let total = 0, solved = 0;
    ROUNDS.forEach((R, i) => { const t = p.times && p.times[R.key];
      if (roundEnded(i)) { total += t != null ? t : missFor(R); if (t != null && !(p.missed && p.missed[R.key])) solved++; } });
    const cur = G && ROUNDS[G.round];
    const doneNow = !!(G && G.phase === "round" && cur && p.times && p.times[cur.key] != null);
    return { id: p.id, name: p.name || "Unnamed pirate", total, solved, doneNow, joinedAt: p.joinedAt || 0 };
  }).sort((a, b) => a.total - b.total || b.solved - a.solved || a.joinedAt - b.joinedAt);
}
async function hostWrite(action, extra) {
  if (hostBusy) return;
  hostBusy = true; render(true);
  try {
    const r = await API.req("POST", "/api/host/action", { action, ...(extra || {}), expect: G ? { gameId: G.gameId, phase: G.phase, round: G.round } : null }, { "x-host-key": hostKey });
    writeErr = ""; if (r && "state" in r) applyState(r.state);
  } catch (e) {
    if (e.status === 409 && e.data && "state" in e.data) { applyState(e.data.state); writeErr = ""; }
    else if (e.status === 401) { hostKeyOk = false; updateHostMode(); writeErr = ""; hostLoginErr = "The first mate's password was rejected."; }
    else writeErr = "Couldn't update the game: " + e.message + ". Try again.";
  }
  hostBusy = false; render(true); pollPlayers();
}
function newGame() { confirmReset = false; toolsOpen = false; return hostWrite("new"); }
function showRules(i) { return hostWrite("rules", { round: i }); }
function startRound(i) { return hostWrite("start", { round: i }); }
function endRound() { return hostWrite("end"); }
const podiumSize = () => Math.min(3, (G.top || []).length);
function revealNext() { return hostWrite("reveal"); }
function publishResults() { return hostWrite("publish"); }
function revealCaptain() { return hostWrite("captain"); }
const holdsAllPieces = p => ALL_ROWS.every(i => { const k = ROUNDS[i].key; return p.times && p.times[k] != null && !(p.missed && p.missed[k]); });

/* ---------- Stage (#stage): a view-only screen for a projector or a slide. No buttons, no joining. ---------- */
let stage = null, stageRefs = {};
async function pollStage() {
  try {
    const t0 = Date.now(), r = await API.req("GET", "/api/stage");
    clockSkew = r.now - Math.round((t0 + Date.now()) / 2); stage = r; updateStage();
  } catch {}
}
function stageKey() { return !gameLoaded ? "s:loading" : !G ? "s:none" : ["s", G.gameId, G.phase, G.round, !!G.published, !!G.captain].join(":"); }
function stageBanner(kicker, title, sub) {
  return h("div", { class: "stage-banner" }, h("div", { class: "logo-kicker", text: kicker }), h("div", { class: "stage-title", text: title }), sub || null);
}
function renderStage() {
  stageRefs = {};
  if (!gameLoaded || !G) { worldIdle(); return screen(grow(), logo(false), grow()); }
  hostWorld();
  const r = G.round, R = ROUNDS[r], where = R ? (R.type === "puzzle" ? "Final challenge" : "Island " + (r + 1) + " of 4") : "";
  if (G.phase === "lobby") {
    stageRefs.count = h("span", { class: "dot", text: "0" });
    return screen(grow(), logo(false), h("div", { class: "stage-lobby" }, h("span", { class: "chip stage-count" }, stageRefs.count, h("span", { text: " pirates aboard" }))), grow());
  }
  if (G.phase === "rules") return screen(stageBanner(where, R.title, h("div", { class: "logo-sub", text: "Get ready…" })));
  if (G.phase === "round" || G.phase === "between") {
    const live = G.phase === "round";
    stageRefs.done = h("p", { class: "strong" }); stageRefs.bar = h("div", { class: "bar-fill", style: "width:0%" }); stageRefs.fast = h("div");
    let sub = null;
    if (live) {
      const cap = capFor(R), clockEl = h("div", { class: "stage-clock" });
      const tick = () => { const left = cap - (serverTime() - (G.roundStartedAt || serverTime())); clockEl.textContent = left > 0 ? clock(left) : "Time's up"; };
      tick(); const iv = setInterval(tick, 100); cleanups.push(() => clearInterval(iv)); sub = clockEl;
    }
    const panel = h("div", { class: "stage-panel" }, sheet(live ? "Live" : "Fastest pirates", [
      live ? stageRefs.done : null, live ? h("div", { class: "bar-track" }, stageRefs.bar) : null,
      h("div", { class: "sub", text: live ? "First ashore" : R.title }), stageRefs.fast], { side: true, color: live ? "navy" : "green", enter: true }));
    if (!live) { const next = ROUNDS[G.round + 1]; sub = next ? h("div", { class: "logo-sub", text: next.type === "puzzle" ? "Next: Captain's Cove" : "Next: " + next.title }) : null; }
    return screen(stageBanner(live ? where : "Conquered!", R.title, sub), panel);
  }
  // results: the podium follows the first mate's reveals; once the captain is revealed, the overlay is the whole screen
  if (G.captain) return screen();
  // The stage keeps the podium hidden until the first mate publishes; then it reveals 3rd, 2nd and 1st by itself.
  const top = G.top || [], size = podiumSize(), shown = G.published ? size : 0, delay = { 3: ".3s", 2: "1.5s", 1: "2.7s" };
  const plinth = place => { const p = top[place - 1], vis = p && place > size - shown;
    return h("div", { class: "plinth p" + place + (vis ? " new" : " hidden"), style: vis ? "animation-delay:" + delay[place] : "" },
      h("div", { class: "place", text: ordinal(place) }), h("div", { class: "pn", text: vis ? p.name : p ? "?" : "—" }), h("div", { class: "pt", text: vis ? fmt(p.total) : "" })); };
  return screen(h("div", { class: "stage-results" }, sheet("Voyage complete!", [
    h("div", { class: "results-grid" }, portrait(G.gameId, ALL_ROWS, false), h("div", { class: "podium" }, plinth(2), plinth(1), plinth(3))),
    h("p", { class: "strong", style: "text-align:center", text: top.length ? (G.totalPlayers === 1 ? "1 pirate" : G.totalPlayers + " pirates") + " found the captain." : "No pirate found the captain this time." }),
  ], { wide: true, color: "green", enter: true })));
}
function updateStage() {
  if (!wantsStage() || !stage || !G) return;
  const R = ROUNDS[G.round];
  if (stageRefs.count) stageRefs.count.textContent = stage.aboard;
  if (stageRefs.done && stage.finished != null) {
    const of = R && R.type === "puzzle" && stage.able != null ? stage.able : stage.aboard;
    stageRefs.done.textContent = stage.finished + " of " + of + (R && R.type === "puzzle" ? " pirates with all 9 pieces finished" : " pirates finished");
    stageRefs.bar.style.width = (of ? Math.min(100, stage.finished / of * 100) : 0) + "%";
  }
  if (stageRefs.fast && stage.fastest) { const k = JSON.stringify(stage.fastest);
    if (stageRefs.fast.dataset.k !== k) { stageRefs.fast.dataset.k = k;
      stageRefs.fast.replaceChildren(stage.fastest.length ? topTable(stage.fastest.map(p => ({ name: p.name, total: p.t })), false) : h("p", { class: "muted", text: "Nobody yet. Who will be first?" })); } }
}

function hostWorld() {
  const r = G.round, gid = G.gameId;
  if (G.phase === "lobby") World.set({ ship: 0, visible: 0, cleared: 0, focus: null, zoom: 1, follow: false });
  else if (G.phase === "rules" || G.phase === "round") { World.set({ visible: Math.min(r, 4), cleared: r, focus: r, zoom: "fit", follow: false }); World.sail(r, r + 1, "h:" + gid + ":arrive:" + r); }
  else if (G.phase === "between") { World.set({ visible: r + 1, cleared: r + 1, focus: r + 1, zoom: "fit", follow: false }); World.sail(r + 1, r + 2, "h:" + gid + ":sail:" + r); }
  else if (G.phase === "results") { World.place(5); World.set({ visible: 4, cleared: 5, focus: 4, zoom: "fit", follow: false }); }
}
function toolsMenu() {
  return h("details", { class: "tools", open: toolsOpen, ontoggle: e => { toolsOpen = e.currentTarget.open; } },
    h("summary", { class: "gbtn small plain" }, "First mate's tools"),
    h("div", { class: "card tools-body" },
      h("button", { class: "gbtn small plain", onclick: () => { viewAs = "player"; currentKey = ""; toolsOpen = false; render(); } }, "Preview player screen"),
      h("button", { class: "gbtn small plain", onclick: () => { hostKeyOk = false; hostKey = ""; lsSet("llc:hostkey", ""); updateHostMode(); currentKey = ""; render(true); } }, "Sign out"),
      confirmReset
        ? h("div", { class: "confirm" }, h("p", { text: "Start a new game? Everyone has to rejoin and all times are cleared." }),
            h("div", { class: "row" }, h("button", { class: "gbtn small coral", onclick: newGame }, "Yes, new game"), h("button", { class: "gbtn small plain", onclick: () => { confirmReset = false; render(true); } }, "Cancel")))
        : h("button", { class: "gbtn small plain", onclick: () => { confirmReset = true; render(true); } }, "New game"),
      h("details", { class: "key", open: keyOpen, ontoggle: e => { keyOpen = e.currentTarget.open; } }, h("summary", { text: "Answer key (don't open while sharing)" }),
        h("p", { class: "small", text: "A river · the compass glints after 45 s · TREASURE · 7 4 8" }))));
}
function renderHost() {
  if (hostTimerIv) { clearInterval(hostTimerIv); hostTimerIv = null; }
  const sk = !gameLoaded ? "loading" : !G ? "none" : [G.gameId, G.phase, G.round, G.reveal || 0, !!G.published, !!G.captain].join(":");
  const enter = sk !== hostScreenKey; hostScreenKey = sk;
  const n = players.length;
  const top = h("div", { class: "host-top" }, logo(true),
    h("div", { class: "row" }, G ? h("span", { class: "chip" }, h("span", { class: "dot", text: String(n) }), n === 1 ? "pirate aboard" : "pirates aboard") : null, toolsMenu()));
  const errP = writeErr ? h("p", { class: "err", text: writeErr }) : null;
  if (!gameLoaded) { worldIdle(); return screen(top, grow(), dock(dialogBox(gameSlow ? "Can't reach the game data yet. This page keeps trying." : "Unrolling the map…"))); }
  if (!G) { worldIdle(); return screen(top, hostGrid([sheet("Ready to set sail?", [
    h("p", { class: "strong", text: "Open the game, then paste this site's link in the meeting chat (without #host on the end). Players join from their own devices." }),
    h("button", { class: "gbtn green big", disabled: hostBusy, onclick: newGame }, "Open the game"), errP], { enter })], null)); }
  hostWorld();
  const rows = standings(), results = G.phase === "results";
  const lostAtSea = (G.crewSize || 0) - (G.totalPlayers || 0);
  const side = results && !G.published ? null : results ? sheet("Final standings", [
    (G.top || []).length ? topTable(G.top.map(p => ({ name: p.name, total: p.total })), false) : h("p", { class: "muted", text: "No pirate found the captain this time." }),
    lostAtSea > 0 ? h("p", { class: "muted small", text: lostAtSea + (lostAtSea === 1 ? " pirate was" : " pirates were") + " lost at sea and aren't ranked." }) : null], { side: true, color: "navy", enter })
  : sheet("Crew standings", [
    G.phase === "round" ? h("div", { class: "sub", text: "Finished challenges only" }) : null,
    rows.length ? topTable(rows.slice(0, 15).map(p => ({ name: p.name, total: G.phase === "lobby" ? null : p.total, doneNow: p.doneNow })), G.phase === "round") : h("p", { class: "muted", text: "Nobody has joined yet." }),
    rows.length > 15 ? h("p", { class: "muted small", text: "+ " + (rows.length - 15) + " more" }) : null], { side: true, color: "navy", enter });
  return screen(top, hostGrid(hostStage(rows, enter, errP), side, results));
}
function hostGrid(stage, side, results) {
  if (results) return h("div", { class: "host-grid results" }, h("div", { class: "center-stage" }, stage), side ? h("div", { class: "side-col" }, side) : h("div"));
  return h("div", { class: "host-grid" }, h("div", { class: "stage-col" }, stage), h("div", { class: "center-col" }), side ? h("div", { class: "side-col" }, side) : h("div"));
}
function hostStage(rows, enter, errP) {
  const r = G.round, R = ROUNDS[r], n = players.length;
  if (G.phase === "lobby") return [sheet("Gather the crew", [
    h("div", { class: "count-row" }, h("div", { class: "bigcount", text: n }), h("div", { class: "count-label", text: n === 1 ? "pirate aboard" : "pirates aboard" })),
    n ? h("div", { class: "names" }, players.slice().sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0)).slice(0, 40).map(p => h("span", { class: "nm-chip", text: p.name || "Pirate" })))
      : h("p", { class: "muted", text: "No one has joined yet." }),
    h("p", { class: "small strong", text: "Players open this site's link from the chat (without #host on the end) and join from their own devices. No sign-in needed." }),
    h("button", { class: "gbtn green big", disabled: hostBusy || n === 0, onclick: () => showRules(0) }, "Set sail for Riddle Reef"), errP], { enter })];
  if (G.phase === "rules") return [sheet(R.title, [
    h("div", { class: "sheet-head" }, h("div", { class: "sub", text: R.type === "puzzle" ? "Final challenge" : "Island " + (r + 1) + " of 4" }), liveChip("Rules on screen")),
    targetCard(R),
    h("ul", { class: "rules" }, [...R.rules, "Time limit: " + capText(R) + "."].map(t => h("li", { text: t }))),
    R.type === "puzzle" ? h("p", { class: "strong", text: players.filter(holdsAllPieces).length + " of " + n + " pirates won every island and can assemble the portrait. The rest wait for the reveal." }) : null,
    h("p", { class: "muted small", text: "Players are reading these rules now. Start when the crew is ready; each player's clock starts when the challenge appears on their screen." }),
    h("button", { class: "gbtn green big", disabled: hostBusy, onclick: () => startRound(r) }, R.type === "puzzle" ? "Start the final challenge" : "Start the challenge"), errP], { color: "navy", enter })];
  if (G.phase === "round") {
    const done = rows.filter(p => p.doneNow).length, cap = capFor(R);
    const timer = h("div", { class: "countdown" });
    const tick = () => { const left = cap - (serverTime() - (G.roundStartedAt || serverTime())); timer.textContent = left > 0 ? clock(left) : "Time's up"; timer.classList.toggle("over", left <= 0); };
    tick(); hostTimerIv = setInterval(tick, 100);
    return [sheet(R.title, [
      h("div", { class: "sheet-head" }, h("div", { class: "sub", text: R.type === "puzzle" ? "Final challenge" : "Island " + (r + 1) + " of 4" }), liveChip("Live")),
      timer,
      h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: "width:" + (n ? done / n * 100 : 0) + "%" })),
      h("p", { class: "strong", text: R.type === "puzzle" ? done + " of " + players.filter(holdsAllPieces).length + " pirates with all 9 pieces finished" : done + " of " + n + " pirates finished" }),
      h("p", { class: "muted small", text: R.rules.join(" ") }),
      h("p", { class: "muted small", text: "Each player's clock starts when the challenge appears on their screen. Anyone still playing when you end it gets " + fmt(missFor(R)) + "." }),
      h("button", { class: "gbtn coral big", disabled: hostBusy, onclick: endRound }, R.type === "puzzle" ? "End game & count results" : "End this challenge"), errP], { enter })];
  }
  if (G.phase === "between") {
    const next = ROUNDS[r + 1];
    const fastest = players.filter(p => p.times && p.times[R.key] != null && !(p.missed && p.missed[R.key])).sort((a, b) => a.times[R.key] - b.times[R.key]).slice(0, 3);
    return [sheet(R.title + " conquered!", [
      h("div", { class: "sub", text: "Fastest pirates" }),
      fastest.length ? topTable(fastest.map(p => ({ name: p.name, total: p.times[R.key] })), false) : h("p", { class: "muted", text: "Nobody finished this one." }),
      h("p", { class: "strong", text: piecesIn(r) + " portrait pieces recovered. " + (next.type === "puzzle" ? "The ship drops anchor at Captain's Cove, where the crew will assemble the portrait." : "The ship sails on to " + next.title + ".") }),
      h("button", { class: "gbtn green big", disabled: hostBusy, onclick: () => showRules(r + 1) }, next.type === "puzzle" ? "Show the final challenge's rules" : "Show the rules for " + next.title), errP], { color: "green", enter })];
  }
  const top = G.top || [], size = podiumSize(), shown = G.reveal || 0, nextPlace = size - shown;
  const plinth = place => { const p = top[place - 1], vis = p && place > size - shown;
    return h("div", { class: "plinth p" + place + (vis ? "" : " hidden") + (vis && enter && place === size - shown + 1 ? " new" : "") },
      h("div", { class: "place", text: ordinal(place) }), h("div", { class: "pn", text: vis ? p.name : p ? "?" : "—" }), h("div", { class: "pt", text: vis ? fmt(p.total) : "" })); };
  // Order: reveal 3rd, 2nd, 1st → publish the winners → the big captain reveal on every screen.
  const shownCaptain = !!G.captain;
  const reopen = () => { const k = capKey("host"); delete capClosed[k]; lsSet(k, ""); render(); };
  const step = nextPlace > 0 ? h("button", { class: "gbtn big", disabled: hostBusy, onclick: revealNext }, nextPlace === 1 ? "Reveal the winner" : "Reveal " + ordinal(nextPlace) + " place")
    : !G.published ? h("button", { class: "gbtn green big", disabled: hostBusy, onclick: publishResults }, "Publish the winners to players")
    : !shownCaptain ? h("button", { class: "gbtn coral big", disabled: hostBusy, onclick: revealCaptain }, "Reveal the lost captain!")
    : h("button", { class: "gbtn plain", onclick: reopen }, "Show the captain again");
  const note = !G.published ? (size ? "Reveal the podium, then publish the winners. Only pirates who found the captain are ranked." : "No pirate found the captain this time. Publish to show everyone the results.")
    : !shownCaptain ? "Players can see the standings. Now for the big moment: the captain's face, on every screen at once."
    : "The captain is revealed on every screen. Over to you, Captain!";
  return [sheet(shownCaptain ? "The captain is found!" : "Voyage complete!", [
    h("div", { class: "results-grid" }, portrait(G.gameId, ALL_ROWS, capDone("host")), h("div", { class: "podium" }, plinth(2), plinth(1), plinth(3))),
    h("div", { class: "row" }, step, G.published ? liveChip("Winners published") : null),
    h("p", { class: "muted small", text: note }), errP],
    { wide: true, color: "green", enter })];
}
boot();

