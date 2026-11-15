/* The Search for Our Long-Lost Captain — game content, world map and challenges. */
/* ---------- Game content ---------- */
const CAP_MS = 90000;      // a challenge auto-closes for a player after 90 s (the portrait has its own cap)
const IMG_URL = "captain.jpg";
const GRID = 3;            // 3×3 portrait; islands 1–4 award 2, 3, 2 and 2 face-down pieces
new Image().src = IMG_URL;

const ROUNDS = [
  { key: "r1", type: "riddle", title: "Riddle Reef",
    rules: ["Read the riddle and pick the right answer.", "Each wrong answer adds 10 seconds."],
    story: "Rolled up inside the scroll: pieces of the captain's portrait." },
  { key: "r2", type: "torch", title: "Shadow Cave Island",
    rules: ["It's dark. Move your torch with the mouse, or drag a finger, to light the way.", "Find the hidden object and tap it once it's lit. Anything else is a decoy."],
    story: "Under the compass, wrapped in oilcloth: more portrait pieces." },
  { key: "r3", type: "scramble", title: "Scramble Shores",
    rules: ["Tap the letters in the right order to unscramble the word.", "Each wrong word adds 5 seconds."],
    story: "The word was TREASURE, and the bottle held more portrait pieces." },
  { key: "r4", type: "lock", title: "Lockdown Island",
    rules: ["Use the clues to work out the three-digit code.", "Each wrong code adds 10 seconds."],
    story: "Click! The chest swings open with the final portrait pieces inside." },
  { key: "r5", type: "puzzle", title: "Captain's Cove", cap: 180000,
    rules: ["Drag the portrait pieces into the frame. A piece snaps in when it's close to its spot.", "Your clock stops when the last piece fits."],
    story: "" },
];
const capFor = R => R.cap || CAP_MS;
const missFor = R => capFor(R) + 30000;
const capText = R => { const s = capFor(R) / 1000, m = Math.floor(s / 60); return (m ? m + " min" : "") + (s % 60 ? (m ? " " : "") + s % 60 + " s" : ""); };
const RIDDLE = { q: "I have a bed but never sleep. I run but never walk. I have a mouth but never talk. What am I?",
  options: ["A river", "A ship", "A cave", "The wind"], answer: "A river" };
const SCRAMBLE = { word: "TREASURE", shown: "SURETAER", hint: "What every pirate is searching for." };
const LOCK = {
  clues: [["345", "One number is correct and in the right place"],
          ["837", "Two numbers are correct but both in the wrong place"],
          ["296", "Nothing is correct"],
          ["412", "One number is correct but in the wrong place"],
          ["508", "One number is correct and in the right place"]],
  options: ["478", "748", "738", "847"], answer: "748" };
const STORY = "Our legendary captain has vanished! Searching the ship, we found an old treasure map showing four mysterious islands. On each one the captain left a challenge and pieces of a portrait. Win the challenges, collect the pieces and assemble the portrait to find our captain. Every challenge is timed, and the lowest total time wins.";

/* ---------- Helpers ---------- */
const $ui = document.getElementById("ui");
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const SVGNS = "http://www.w3.org/2000/svg";
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const c of kids.flat(Infinity)) if (c) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function fmt(ms) {
  if (ms == null) return "—";
  const sec = ms / 1000;
  if (sec < 60) return sec.toFixed(2) + "s";
  const m = Math.floor(sec / 60);
  return m + ":" + (sec - m * 60).toFixed(2).padStart(5, "0");
}
function clock(ms) {
  const sec = Math.max(0, ms) / 1000;
  if (sec < 60) return sec.toFixed(1) + "s";
  const m = Math.floor(sec / 60);
  return m + ":" + (sec - m * 60).toFixed(1).padStart(4, "0");
}
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch {} }
function rng(seedStr) {
  let a = 0; for (const c of seedStr) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const newId = () => Math.random().toString(36).slice(2, 10);
const ordinal = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
const reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ---------- Portrait pieces ---------- */
function edgeSigns(gid) {
  const rand = rng(gid + ":jig");
  const flip = () => (rand() < .5 ? 1 : -1);
  const H = Array.from({ length: GRID - 1 }, () => Array.from({ length: GRID }, flip));
  const V = Array.from({ length: GRID }, () => Array.from({ length: GRID - 1 }, flip));
  return { H, V };
}
function edge(sx, sy, dx, dy, nx, ny, sign) {
  if (!sign) return "L" + (sx + dx) + " " + (sy + dy);
  const P = (t, k) => (sx + t * dx + k * sign * nx).toFixed(2) + " " + (sy + t * dy + k * sign * ny).toFixed(2);
  return "L" + P(.34, 0) + "C" + P(.40, 0) + " " + P(.40, .08) + " " + P(.37, .14) +
    "C" + P(.33, .22) + " " + P(.40, .28) + " " + P(.50, .28) + "C" + P(.60, .28) + " " + P(.67, .22) + " " + P(.63, .14) +
    "C" + P(.60, .08) + " " + P(.60, 0) + " " + P(.66, 0) + "L" + P(1, 0);
}
function piecePath(r, c, E) {
  const top = r > 0 ? -E.H[r - 1][c] : 0, right = c < GRID - 1 ? E.V[r][c] : 0;
  const bottom = r < GRID - 1 ? E.H[r][c] : 0, left = c > 0 ? -E.V[r][c - 1] : 0;
  return "M0 0" + edge(0, 0, 100, 0, 0, -100, top) + edge(100, 0, 0, 100, 100, 0, right) +
    edge(100, 100, -100, 0, 0, 100, bottom) + edge(0, 100, 0, -100, -100, 0, left) + "Z";
}
let clipSeq = 0;
// mode: true = picture, "back" = won but face-down, false = not won yet
function pieceGroup(r, c, E, mode) {
  const d = piecePath(r, c, E);
  if (mode === "back") return s("g", null, s("path", { d, fill: "#ffc93c", stroke: "#1f2d4d", "stroke-width": "5", "stroke-linejoin": "round" }),
    s("text", { x: 50, y: 68, "text-anchor": "middle", "font-size": "48", fill: "#1f2d4d", "font-family": "Lilita One, sans-serif" }, "?"));
  if (!mode) return s("g", null, s("path", { d, fill: "#d7eef5", stroke: "#9cc3d3", "stroke-width": "3", "stroke-dasharray": "8 6" }));
  const id = "pc" + (++clipSeq);
  return s("g", null, s("defs", null, s("clipPath", { id }, s("path", { d }))),
    s("image", { href: IMG_URL, x: -c * 100, y: -r * 100, width: GRID * 100, height: GRID * 100, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#" + id + ")", "pointer-events": "none" }),
    s("path", { d, fill: "none", stroke: "#1f2d4d66", "stroke-width": "2", "pointer-events": "none" }));
}
function revealOrder(gid) {
  const rand = rng(gid + ":reveal");
  const order = Array.from({ length: GRID * GRID }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
const ALL_ROWS = [0, 1, 2, 3];   // the four islands that award pieces
const roundStart = i => Math.round(i * GRID * GRID / ALL_ROWS.length);
const piecesIn = i => roundStart(i + 1) - roundStart(i);
const piecesUpTo = rounds => rounds.reduce((n, i) => n + piecesIn(i), 0);
function portrait(gid, rounds, faceUp, freshRounds) {
  const E = edgeSigns(gid), order = revealOrder(gid);
  const shown = new Set(rounds.flatMap(i => order.slice(roundStart(i), roundStart(i + 1))));
  const fresh = new Set((freshRounds || []).flatMap(i => order.slice(roundStart(i), roundStart(i + 1))));
  const g = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    const pg = pieceGroup(r, c, E, shown.has(r * GRID + c) ? (faceUp ? true : "back") : false);
    pg.setAttribute("transform", "translate(" + c * 100 + " " + r * 100 + ")");
    if (fresh.has(r * GRID + c)) pg.setAttribute("class", "fresh");
    g.push(pg);
  }
  const all = faceUp && shown.size === GRID * GRID;
  return h("div", { class: "portrait" }, s("svg", { viewBox: "-3 -3 " + (GRID * 100 + 6) + " " + (GRID * 100 + 6), role: "img",
    "aria-label": all ? "The captain's portrait" : shown.size + " of " + GRID * GRID + " portrait pieces collected" }, g));
}

/* ---------- The world: a painted archipelago (static layer) ---------- */
const MW = 2000, MH = 1200;
const ISL = [
  { x: 520, y: 760, r: 140, kind: "reef" },
  { x: 880, y: 330, r: 160, kind: "cave" },
  { x: 1260, y: 790, r: 140, kind: "shore" },
  { x: 1620, y: 330, r: 145, kind: "lock" },
  { x: 1830, y: 925, r: 95, kind: "cove" },
];
const PORT = { x: -30, y: 1230, r: 280, kind: "port" };
const ISL_NAMES = ["Riddle Reef", "Shadow Cave Island", "Scramble Shores", "Lockdown Island", "Captain's Cove"];
// node 0 = home port, node i+1 = anchorage off island i
const DOCKS = [[300, 975], [520, 965], [880, 565], [1260, 995], [1620, 550], [1700, 985]];
const WAY = [
  [[300, 975], [410, 1010], [520, 965]],
  [[520, 965], [700, 905], [765, 700], [880, 565]],
  [[880, 565], [1040, 625], [1060, 715], [1085, 900], [1170, 980], [1260, 995]],
  [[1260, 995], [1450, 965], [1480, 700], [1620, 550]],
  [[1620, 550], [1705, 680], [1690, 860], [1700, 985]],
];
const FLAGPT = [[0, -.62], [-.44, -.38], [.3, -.3], [0, -.2], [-.3, -.15]];
const KIND = {
  reef: { top: ["#7fdc6e", "#45a752"], cliff: "#2f7d3c", k: .82 },
  cave: { top: ["#5f9a72", "#2f5f45"], cliff: "#244a35", k: .84 },
  shore: { top: ["#8ddc6c", "#58b35a"], cliff: "#3a8a45", k: .56 },
  lock: { top: ["#c3c8d1", "#8d93a0"], cliff: "#5d6270", k: .88 },
  cove: { top: ["#85d870", "#4aa857"], cliff: "#2f7d3c", k: .8 },
  port: { top: ["#85d870", "#4aa857"], cliff: "#2f7d3c", k: .84 },
};
function makeBlob(seed) {
  const g = rng(seed), p = [g() * 6, g() * 6, g() * 6, g() * 6];
  return Array.from({ length: 120 }, (_, k) => { const a = k / 120 * Math.PI * 2;
    const rr = 1 + .11 * Math.sin(3 * a + p[0]) + .07 * Math.sin(5 * a + p[1]) + .035 * Math.sin(9 * a + p[2]) + .02 * Math.sin(14 * a + p[3]);
    return [Math.cos(a) * rr, Math.sin(a) * rr]; });
}
ISL.forEach((I, i) => { I.blob = makeBlob("isle" + i); });
PORT.blob = makeBlob("port");
function blobPath(c, I, k, dx, dy) {
  dx = dx || 0; dy = dy || 0;
  c.beginPath(); I.blob.forEach(([x, y], j) => { const X = I.x + dx + x * I.r * k, Y = I.y + dy + y * I.r * k; j ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath();
}
function disc(c, x, y, r, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function tree(c, x, y, sz) {
  c.fillStyle = "rgba(20,60,30,.35)"; c.beginPath(); c.ellipse(x + sz * .25, y + sz * .55, sz * 1.05, sz * .55, 0, 0, Math.PI * 2); c.fill();
  disc(c, x, y, sz, "#2f8a45"); disc(c, x - sz * .2, y - sz * .22, sz * .75, "#4cbf5e"); disc(c, x - sz * .38, y - sz * .42, sz * .32, "#8be37a");
}
function palm(c, x, y, sz, g) {
  c.fillStyle = "rgba(20,60,30,.3)"; c.beginPath(); c.ellipse(x + sz * .5, y + sz * .1, sz * .9, sz * .35, 0, 0, Math.PI * 2); c.fill();
  const tx = x + sz * .1, ty = y - sz * 1.3;
  c.strokeStyle = "#8a5a32"; c.lineWidth = sz * .26; c.lineCap = "round";
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sz * .35, y - sz * .6, tx, ty); c.stroke();
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + g() * .4, ex = tx + Math.cos(a) * sz * 1.1, ey = ty + Math.sin(a) * sz * .7 + sz * .2;
    const mx = (tx + ex) / 2 - Math.sin(a) * sz * .25, my = (ty + ey) / 2 - sz * .35;
    c.fillStyle = k % 2 ? "#3fae5a" : "#4cc26b";
    c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(mx, my - sz * .2, ex, ey); c.quadraticCurveTo(mx, my + sz * .2, tx, ty); c.fill();
  }
  disc(c, tx - 3, ty + 4, sz * .14, "#6b4a22"); disc(c, tx + 4, ty + 5, sz * .14, "#6b4a22");
}
function pine(c, x, y, sz) {
  c.fillStyle = "rgba(20,40,30,.35)"; c.beginPath(); c.ellipse(x + sz * .3, y + sz * .1, sz * .7, sz * .3, 0, 0, Math.PI * 2); c.fill();
  for (const [dy, w, col] of [[0, .7, "#2b5e40"], [-.45, .55, "#3a7a52"], [-.85, .4, "#4c9563"]]) {
    c.fillStyle = col; c.beginPath(); c.moveTo(x - sz * w, y + dy * sz); c.lineTo(x, y + (dy - .8) * sz); c.lineTo(x + sz * w, y + dy * sz); c.closePath(); c.fill();
  }
}
function house(c, x, y, roof) {
  c.fillStyle = "rgba(20,40,30,.3)"; c.fillRect(x - 14, y + 2, 38, 10);
  c.strokeStyle = "#1f2d4d"; c.lineWidth = 3;
  c.fillStyle = "#fff3d6"; c.fillRect(x - 17, y - 18, 34, 24); c.strokeRect(x - 17, y - 18, 34, 24);
  c.fillStyle = roof; c.beginPath(); c.moveTo(x - 22, y - 16); c.lineTo(x, y - 36); c.lineTo(x + 22, y - 16); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "#1f2d4d"; c.fillRect(x - 4, y - 8, 8, 14);
}
function mountain(c, x, y, w, lit, shade) {
  const px = x, py = y - w * .85, lx = x - w * .6, rx = x + w * .6, by = y + w * .2;
  c.fillStyle = shade; c.beginPath(); c.moveTo(lx, by); c.lineTo(px, py); c.lineTo(rx, by); c.closePath(); c.fill();
  c.fillStyle = lit; c.beginPath(); c.moveTo(lx, by); c.lineTo(px, py); c.lineTo(x + w * .06, by); c.closePath(); c.fill();
  c.strokeStyle = "rgba(31,45,77,.55)"; c.lineWidth = 3; c.beginPath(); c.moveTo(lx, by); c.lineTo(px, py); c.lineTo(rx, by); c.stroke();
}
function drawIsland(c, I) {
  const K = KIND[I.kind], g = rng("deco" + I.kind);
  blobPath(c, I, 1.42); c.fillStyle = "rgba(102,226,214,.30)"; c.fill();
  blobPath(c, I, 1.22); c.fillStyle = "rgba(150,238,226,.55)"; c.fill();
  blobPath(c, I, 1.11); c.fillStyle = "rgba(255,255,255,.6)"; c.fill();
  blobPath(c, I, 1.06); c.fillStyle = "#e3c27f"; c.fill();
  blobPath(c, I, 1.0); c.fillStyle = "#f8e2a9"; c.fill();
  c.save(); blobPath(c, I, 1.0); c.clip();
  for (let k = 0; k < 140; k++) disc(c, I.x + (g() - .5) * I.r * 2.2, I.y + (g() - .5) * I.r * 2.2, 1 + g() * 2.2, g() < .5 ? "rgba(200,160,90,.35)" : "rgba(255,255,255,.35)");
  c.restore();
  blobPath(c, I, K.k, 0, 16); c.fillStyle = K.cliff; c.fill();
  blobPath(c, I, K.k);
  const tg = c.createLinearGradient(I.x, I.y - I.r, I.x, I.y + I.r); tg.addColorStop(0, K.top[0]); tg.addColorStop(1, K.top[1]);
  c.fillStyle = tg; c.fill();
  blobPath(c, I, K.k * .62, -I.r * .1, -I.r * .14); c.fillStyle = "rgba(255,255,255,.13)"; c.fill();
  c.save(); blobPath(c, I, K.k); c.clip();
  for (let k = 0; k < 160; k++) { const x = I.x + (g() - .5) * I.r * 2, y = I.y + (g() - .5) * I.r * 2;
    c.strokeStyle = g() < .5 ? "rgba(0,60,20,.18)" : "rgba(255,255,255,.18)"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x - 1, y - 6); c.lineTo(x + 2, y); c.stroke(); }
  c.restore();
  const at = (a, d) => [I.x + Math.cos(a) * I.r * d, I.y + Math.sin(a) * I.r * d];
  if (I.kind === "reef") {
    blobPath(c, I, .44, 12, -4); c.fillStyle = "#f8e2a9"; c.fill();
    const lg = c.createRadialGradient(I.x + 12, I.y - 4, 4, I.x + 12, I.y - 4, I.r * .4);
    lg.addColorStop(0, "#a8f7ea"); lg.addColorStop(1, "#38c0c8");
    blobPath(c, I, .37, 12, -4); c.fillStyle = lg; c.fill();
    for (let k = 0; k < 64; k++) { const [x, y] = at(g() * 6.283, 1.14 + g() * .24);
      disc(c, x, y, 2.5 + g() * 4.5, ["#ff8a7a", "#ffb86b", "#e05f9e", "#ffd36b", "#b07ae0"][k % 5]); }
    for (let k = 0; k < 8; k++) { const [x, y] = at(k / 8 * 6.283 + .2, .64); palm(c, x, y, 24, g); }
    const tx = I.x - I.r * .38, ty = I.y + I.r * .42;
    c.fillStyle = "rgba(20,40,30,.3)"; c.fillRect(tx - 14, ty + 18, 40, 10);
    c.fillStyle = "#cfd3dc"; c.strokeStyle = "#1f2d4d"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(tx - 18, ty + 22); c.lineTo(tx - 18, ty - 14); c.quadraticCurveTo(tx, ty - 34, tx + 18, ty - 14); c.lineTo(tx + 18, ty + 22); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = "#1f2d4d"; c.lineWidth = 5; c.lineCap = "round";
    c.beginPath(); c.arc(tx, ty - 8, 7, Math.PI * 1.1, Math.PI * 2.4); c.lineTo(tx, ty + 4); c.stroke(); disc(c, tx, ty + 13, 3, "#1f2d4d");
  } else if (I.kind === "cave") {
    const X = I.x, Y = I.y;
    // sandy path from the cave mouth down to the anchorage
    c.lineCap = "round"; c.lineJoin = "round";
    c.strokeStyle = "#c9a866"; c.lineWidth = 17; c.beginPath(); c.moveTo(X + 2, Y + 60); c.quadraticCurveTo(X + 44, Y + 102, X + 6, Y + 150); c.stroke();
    c.strokeStyle = "#ecd39a"; c.lineWidth = 10; c.stroke();
    for (let k = 0; k < 15; k++) { const [x, y] = at(k / 15 * 6.283 + .25, .68 + g() * .1); if (y > Y + 60 && Math.abs(x - X - 22) < 42) continue; pine(c, x, y, 19); }
    // the massif: one jagged ridge line, shaded body, lit west slopes
    const P = [[-118, 46], [-100, 4], [-82, -30], [-66, -58], [-50, -36], [-30, -80], [-12, -124], [8, -96], [24, -108], [44, -70], [62, -86], [84, -36], [104, -6], [120, 46]].map(([dx, dy]) => [X + dx, Y + dy]);
    const sil = () => { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (const p of P) c.lineTo(p[0], p[1]); c.quadraticCurveTo(X, Y + 74, P[0][0], P[0][1]); c.closePath(); };
    c.fillStyle = "rgba(20,30,40,.38)"; c.beginPath(); c.ellipse(X + 12, Y + 56, 132, 26, 0, 0, Math.PI * 2); c.fill();
    sil(); const body = c.createLinearGradient(X, Y - 124, X, Y + 64); body.addColorStop(0, "#5d5687"); body.addColorStop(1, "#2b2742"); c.fillStyle = body; c.fill();
    c.save(); sil(); c.clip();
    for (let i = 1; i < P.length - 1; i++) {
      if (!(P[i][1] < P[i - 1][1] && P[i][1] < P[i + 1][1])) continue;   // only real peaks
      const lit = c.createLinearGradient(P[i][0], P[i][1], P[i][0], Y + 64); lit.addColorStop(0, "#9d95cf"); lit.addColorStop(1, "#5e578a");
      c.fillStyle = lit; c.beginPath(); c.moveTo(P[i - 1][0], P[i - 1][1]); c.lineTo(P[i][0], P[i][1]); c.lineTo(P[i][0] + 8, Y + 70); c.lineTo(P[i - 1][0] - 14, Y + 70); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(P[i][0], P[i][1]); c.lineTo(P[i][0] - 6, P[i][1] + 22); c.lineTo(P[i][0] + 2, P[i][1] + 46); c.stroke();
      c.fillStyle = "rgba(235,240,255,.85)"; c.beginPath(); c.moveTo(P[i][0], P[i][1]); c.lineTo(P[i][0] + 9, P[i][1] + 12); c.lineTo(P[i][0] + 2, P[i][1] + 9); c.lineTo(P[i][0] - 4, P[i][1] + 14); c.lineTo(P[i][0] - 8, P[i][1] + 10); c.closePath(); c.fill();
    }
    c.strokeStyle = "rgba(18,12,40,.45)"; c.lineWidth = 2;
    for (let k = 0; k < 22; k++) { const x = X - 92 + g() * 184, y = Y - 50 + g() * 92; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 7 + g() * 9, y + 3 + g() * 7); c.lineTo(x + 3 + g() * 6, y + 12 + g() * 6); c.stroke(); }
    c.restore();
    sil(); c.strokeStyle = "#1f2d4d"; c.lineWidth = 4; c.stroke();
    // the cave, carved into the front face, glowing from inside
    const mx = X + 2, my = Y + 34;
    const spill = c.createRadialGradient(mx, my + 34, 4, mx, my + 34, 78); spill.addColorStop(0, "rgba(95,224,212,.6)"); spill.addColorStop(1, "rgba(95,224,212,0)");
    c.fillStyle = spill; c.fillRect(mx - 80, my - 44, 160, 160);
    const arch = (w, ht) => { c.beginPath(); c.moveTo(mx - w, my + 24); c.bezierCurveTo(mx - w, my - ht * .7, mx - w * .55, my - ht, mx, my - ht); c.bezierCurveTo(mx + w * .55, my - ht, mx + w, my - ht * .7, mx + w, my + 24); c.closePath(); };
    arch(46, 60); c.fillStyle = "#a59ed0"; c.fill(); c.strokeStyle = "#1f2d4d"; c.lineWidth = 4; c.stroke();
    c.strokeStyle = "rgba(31,45,77,.35)"; c.lineWidth = 2; for (const a of [-.9, -.45, 0, .45, .9]) { c.beginPath(); c.moveTo(mx + Math.sin(a) * 34, my - Math.cos(a) * 46); c.lineTo(mx + Math.sin(a) * 44, my - Math.cos(a) * 58); c.stroke(); }
    arch(34, 47); const inner = c.createRadialGradient(mx, my + 14, 2, mx, my + 4, 50);
    inner.addColorStop(0, "#7ff5e8"); inner.addColorStop(.3, "#1d7f84"); inner.addColorStop(1, "#07050d"); c.fillStyle = inner; c.fill(); c.strokeStyle = "#1f2d4d"; c.lineWidth = 3; c.stroke();
    c.fillStyle = "#a59ed0"; c.strokeStyle = "#1f2d4d"; c.lineWidth = 2;
    for (const [dx, len] of [[-22, 11], [-10, 18], [3, 12], [15, 16], [25, 8]]) { const tx = mx + dx, ty = my - 46 + Math.abs(dx) * .42;
      c.beginPath(); c.moveTo(tx - 5, ty); c.lineTo(tx, ty + len); c.lineTo(tx + 5, ty); c.closePath(); c.fill(); c.stroke(); }
    for (const [dx, dy, sz] of [[-56, 22, 15], [-66, 27, 9], [52, 24, 13], [63, 20, 8], [-6, 40, 7]]) { const x = mx + dx, y = my + dy;
      c.fillStyle = "#5fe0d4"; c.beginPath(); c.moveTo(x, y - sz * 1.8); c.lineTo(x + sz * .55, y); c.lineTo(x - sz * .55, y); c.closePath(); c.fill(); c.strokeStyle = "#1f2d4d"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "rgba(255,255,255,.75)"; c.beginPath(); c.moveTo(x - 1, y - sz * 1.45); c.lineTo(x + sz * .2, y - sz * .35); c.lineTo(x - sz * .25, y - sz * .35); c.closePath(); c.fill(); }
    for (const [dx, dy] of [[-96, 40], [94, 44], [-30, 58]]) { c.fillStyle = "#4a4566"; c.strokeStyle = "#1f2d4d"; c.lineWidth = 2.5; c.beginPath(); c.ellipse(X + dx, Y + dy, 11, 8, .3, 0, Math.PI * 2); c.fill(); c.stroke(); disc(c, X + dx - 3, Y + dy - 3, 3, "rgba(255,255,255,.35)"); }
    c.fillStyle = "rgba(232,238,255,.4)";
    for (const [dx, dy, w] of [[-44, -64, 42], [34, -86, 36], [74, -52, 28], [-86, -20, 24]]) { c.beginPath(); c.ellipse(X + dx, Y + dy, w, 7, -.12, 0, Math.PI * 2); c.fill(); }
  } else if (I.kind === "shore") {
    for (let k = 0; k < 7; k++) { const [x, y] = at(k / 7 * 6.283 + .5, .74 + g() * .1); palm(c, x, y, 22, g); }
    const hx = I.x - 12, hy = I.y + 8;
    c.fillStyle = "rgba(20,40,30,.3)"; c.fillRect(hx - 24, hy + 16, 58, 10);
    c.strokeStyle = "#1f2d4d"; c.lineWidth = 3;
    c.fillStyle = "#b07240"; c.fillRect(hx - 26, hy - 12, 52, 30); c.strokeRect(hx - 26, hy - 12, 52, 30);
    c.fillStyle = "#3a2210"; c.fillRect(hx - 7, hy + 2, 14, 16);
    c.fillStyle = "#f0be5a"; c.beginPath(); c.moveTo(hx - 36, hy - 8); c.lineTo(hx, hy - 42); c.lineTo(hx + 36, hy - 8); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = "#c98f2e"; c.lineWidth = 2; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(hx + k * 9, hy - 10); c.lineTo(hx + k * 4, hy - 34); c.stroke(); }
    const bx = I.x + 58, by = I.y + 74;
    c.save(); c.translate(bx, by); c.rotate(-.6);
    c.fillStyle = "#3fae6a"; c.strokeStyle = "#1f2d4d"; c.lineWidth = 3;
    c.beginPath(); c.ellipse(0, 0, 9, 17, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillRect(-3.5, -27, 7, 11); c.strokeRect(-3.5, -27, 7, 11);
    c.fillStyle = "#c08a4a"; c.fillRect(-3.5, -31, 7, 5); c.fillStyle = "#fff8e7"; c.fillRect(-3, -6, 6, 9); c.restore();
    for (let k = 0; k < 9; k++) disc(c, I.x + 20 + k * 6, I.y + 40 + k * 4 + (k % 2) * 5, 2.4, "#d4b06f");
    for (const [sx, sy] of [[I.x - 70, I.y + 70], [I.x + 80, I.y - 40]]) {
      c.fillStyle = "#ff8a6b"; c.beginPath();
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283 - 1.57, rr = k % 2 ? 4 : 10; c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      c.closePath(); c.fill(); }
  } else if (I.kind === "lock") {
    const rx = I.r * .58, ry = I.r * .5;
    c.strokeStyle = "#1f2d4d"; c.lineWidth = 26; c.beginPath(); c.ellipse(I.x, I.y, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "#e2e5eb"; c.lineWidth = 20; c.stroke();
    c.fillStyle = "#c9ccd4"; c.beginPath(); c.ellipse(I.x, I.y, rx - 13, ry - 13, 0, 0, Math.PI * 2); c.fill();
    for (let k = 0; k < 26; k++) { const a = k / 26 * 6.283, x = I.x + Math.cos(a) * rx, y = I.y + Math.sin(a) * ry;
      c.fillStyle = "#f2f4f7"; c.strokeStyle = "#1f2d4d"; c.lineWidth = 2; c.fillRect(x - 4, y - 4, 8, 8); c.strokeRect(x - 4, y - 4, 8, 8); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, x = I.x + Math.cos(a) * rx, y = I.y + Math.sin(a) * ry;
      disc(c, x + 3, y + 5, 19, "rgba(20,30,50,.3)"); disc(c, x, y, 18, "#eef0f4"); c.strokeStyle = "#1f2d4d"; c.lineWidth = 3; c.stroke();
      disc(c, x, y, 12, "#ff6b4a"); c.stroke(); disc(c, x - 3, y - 3, 4, "rgba(255,255,255,.6)"); }
    c.fillStyle = "#3a2a1a"; c.beginPath(); c.ellipse(I.x, I.y + ry, 12, 14, 0, Math.PI, 0); c.fill();
    const cx = I.x, cy = I.y - 2;
    c.fillStyle = "rgba(20,30,50,.3)"; c.fillRect(cx - 22, cy + 14, 48, 8);
    c.strokeStyle = "#1f2d4d"; c.lineWidth = 3; c.fillStyle = "#9a5b2a"; c.fillRect(cx - 24, cy - 6, 48, 22); c.strokeRect(cx - 24, cy - 6, 48, 22);
    c.fillStyle = "#b8743a"; c.beginPath(); c.moveTo(cx - 24, cy - 6); c.quadraticCurveTo(cx, cy - 26, cx + 24, cy - 6); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#ffc93c"; c.fillRect(cx - 24, cy - 2, 48, 4); c.fillRect(cx - 5, cy - 6, 10, 12); c.strokeRect(cx - 5, cy - 6, 10, 12);
  } else if (I.kind === "cove") {
    palm(c, I.x - 50, I.y + 30, 20, g); palm(c, I.x + 45, I.y + 40, 18, g);
    house(c, I.x - 32, I.y + 14, "#ff6b4a");
    const lx = I.x + 22, ly = I.y + 18;
    c.fillStyle = "rgba(20,40,30,.3)"; c.beginPath(); c.ellipse(lx + 14, ly + 4, 24, 8, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#1f2d4d"; c.lineWidth = 3;
    c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(lx - 15, ly); c.lineTo(lx - 10, ly - 72); c.lineTo(lx + 10, ly - 72); c.lineTo(lx + 15, ly); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#ff6b4a"; for (const yy of [-14, -38, -60]) { c.beginPath(); c.moveTo(lx - 14 + (-yy / 72) * 5, ly + yy); c.lineTo(lx + 14 - (-yy / 72) * 5, ly + yy); c.lineTo(lx + 13 - (-yy / 72) * 5, ly + yy - 10); c.lineTo(lx - 13 + (-yy / 72) * 5, ly + yy - 10); c.closePath(); c.fill(); }
    c.fillStyle = "#1f2d4d"; c.fillRect(lx - 13, ly - 76, 26, 5);
    c.fillStyle = "#ffe27a"; c.fillRect(lx - 8, ly - 90, 16, 14); c.strokeRect(lx - 8, ly - 90, 16, 14);
    c.fillStyle = "#ff6b4a"; c.beginPath(); c.moveTo(lx - 11, ly - 90); c.lineTo(lx, ly - 102); c.lineTo(lx + 11, ly - 90); c.closePath(); c.fill(); c.stroke();
  } else if (I.kind === "port") {
    for (const [x, y, roof] of [[55, 1045, "#ff6b4a"], [120, 1100, "#3fbf6a"], [40, 1120, "#ffc93c"], [165, 1150, "#ff6b4a"], [90, 1170, "#2f4170"]]) house(c, x, y, roof);
    for (const [x, y] of [[150, 1020], [20, 990], [200, 1090]]) tree(c, x, y, 16);
  }
}
function drawBase(c) {
  const g = rng("base");
  c.fillStyle = "#1a6fb0"; c.fillRect(0, 0, MW, MH);
  for (let i = 0; i < 46; i++) { const x = g() * MW, y = g() * MH, r = 120 + g() * 260, dark = g() < .6;
    const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, dark ? "rgba(12,72,130,.45)" : "rgba(70,170,215,.25)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); }
  for (const I of ISL.concat([PORT])) { const r = I.r * 2.3;
    const gr = c.createRadialGradient(I.x, I.y, I.r * .8, I.x, I.y, r); gr.addColorStop(0, "rgba(64,196,214,.75)"); gr.addColorStop(1, "rgba(64,196,214,0)");
    c.fillStyle = gr; c.fillRect(I.x - r, I.y - r, r * 2, r * 2); }
  c.lineWidth = 2; c.lineCap = "round";
  for (let i = 0; i < 900; i++) { const x = g() * MW, y = g() * MH, w = 8 + g() * 18;
    c.strokeStyle = "rgba(255,255,255," + (.03 + g() * .06) + ")"; c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y - 4, x + w, y); c.stroke(); }
  for (let i = 0; i < 40; i++) { const x = g() * MW, y = g() * MH;
    if (ISL.some(I => Math.hypot(I.x - x, I.y - y) < I.r * 1.7) || Math.hypot(x - PORT.x, y - PORT.y) < 450 || WAY.flat().some(p => Math.hypot(p[0] - x, p[1] - y) < 90)) continue;
    c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.ellipse(x, y + 4, 22, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#8f95a3"; c.strokeStyle = "#1f2d4d"; c.lineWidth = 2.5; c.beginPath(); c.ellipse(x, y, 13, 9, g() * 3, 0, Math.PI * 2); c.fill(); c.stroke();
    disc(c, x - 3, y - 3, 3.5, "rgba(255,255,255,.45)"); }
  drawIsland(c, PORT);
  c.strokeStyle = "#1f2d4d"; c.lineWidth = 20; c.lineCap = "butt"; c.beginPath(); c.moveTo(212, 1040); c.lineTo(282, 992); c.stroke();
  c.strokeStyle = "#a8693a"; c.lineWidth = 14; c.stroke();
  c.strokeStyle = "#7a4a26"; c.lineWidth = 2; for (let k = 0; k < 7; k++) { const x = 216 + k * 10, y = 1037 - k * 6.8; c.beginPath(); c.moveTo(x - 4, y - 6); c.lineTo(x + 4, y + 6); c.stroke(); }
  ISL.forEach(I => drawIsland(c, I));
  const E = 150, col = "25,106,169";
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, E, 0, 0, 0, E, MH], [MW, 0, MW - E, 0, MW - E, 0, E, MH], [0, 0, 0, E, 0, 0, MW, E], [0, MH, 0, MH - E, 0, MH - E, MW, E]]) {
    const gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(" + col + ",1)"); gr.addColorStop(1, "rgba(" + col + ",0)");
    c.fillStyle = gr; c.fillRect(rx, ry, rw, rh); }
}

/* ---------- The world: camera, ship, fog and everything that moves ---------- */
const World = (() => {
  const cv = document.getElementById("world"), ctx = cv.getContext("2d");
  function spline(pts) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      for (let k = 0; k < 20; k++) { const t = k / 20, t2 = t * t, t3 = t2 * t;
        const f = j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push([f(0), f(1)]); }
    }
    out.push(pts[pts.length - 1]);
    const len = [0];
    for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, len, total: len[len.length - 1] };
  }
  const ROUTES = WAY.map(spline);
  function along(R, f) {
    const target = f * R.total; let i = 1;
    while (i < R.len.length - 1 && R.len[i] < target) i++;
    const a = R.pts[i - 1], b = R.pts[i], d = R.len[i] - R.len[i - 1] || 1, u = Math.max(0, Math.min(1, (target - R.len[i - 1]) / d));
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, dx: b[0] - a[0] };
  }
  function partPath(R, a, b) {
    const A = a * R.total, B = b * R.total; let started = false;
    ctx.beginPath();
    for (let i = 1; i < R.pts.length; i++) {
      const l0 = R.len[i - 1], l1 = R.len[i]; if (l1 < A) continue; if (l0 > B) break;
      const p0 = R.pts[i - 1], p1 = R.pts[i], d = l1 - l0 || 1, u0 = Math.max(0, (A - l0) / d), u1 = Math.min(1, (B - l0) / d);
      if (!started) { ctx.moveTo(p0[0] + (p1[0] - p0[0]) * u0, p0[1] + (p1[1] - p0[1]) * u0); started = true; }
      ctx.lineTo(p0[0] + (p1[0] - p0[0]) * u1, p0[1] + (p1[1] - p0[1]) * u1);
    }
  }
  const gW = rng("waves"), WAVES = [];
  for (let i = 0; i < 260; i++) { const x = gW() * MW, y = gW() * MH;
    if (ISL.some(I => Math.hypot(I.x - x, I.y - y) < I.r * 1.5) || Math.hypot(x - PORT.x, y - PORT.y) < 420) continue;
    WAVES.push({ x, y, ph: gW() * 6.28, w: 9 + gW() * 9 }); }
  // A cumulus cluster: overlapping puffs on a flat base, drawn as one merged shape.
  function makeCluster(g) {
    const puffs = [[-.42, .02, .27], [-.2, -.18, .34], [.12, -.27, .4], [.4, -.06, .3], [.02, .03, .36], [-.3, .1, .22], [.3, .1, .22]]
      .map(([x, y, r]) => [x + (g() - .5) * .08, y + (g() - .5) * .08, r * (.9 + g() * .2)]);
    return { puffs, base: [.5, .14] };
  }
  const FOG = ISL.map((I, i) => { const g = rng("fog2" + i);
    const list = [{ ox: 0, oy: -I.r * .08, W: I.r * 1.3 }];
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283 + .5 + g() * .5; list.push({ ox: Math.cos(a) * I.r * .62, oy: Math.sin(a) * I.r * .52 + I.r * .06, W: I.r * (.95 + g() * .25) }); }
    return list.map(o => ({ ...o, cl: makeCluster(g), ph: g() * 6.28 })).sort((a, b) => a.oy - b.oy); });
  const gC = rng("sky");
  const CLOUDS = [{ x: 200, y: 180, W: 170, v: 9 }, { x: 1100, y: 1050, W: 210, v: 6 }, { x: 1650, y: 620, W: 130, v: 12 }].map(c => ({ ...c, cl: makeCluster(gC) }));
  function cloudPath(c, cx, cy, cl, W, dx, dy, lit) {
    c.beginPath();
    for (const [x, y, r] of cl.puffs) {
      const R = r * W * (lit ? .8 : 1), X = cx + x * W + dx - (lit ? r * W * .12 : 0), Y = cy + y * W + dy - (lit ? r * W * .2 : 0);
      c.moveTo(X + R, Y); c.arc(X, Y, R, 0, Math.PI * 2);
    }
    if (!lit) { const bx = cl.base[0] * W, by = cl.base[1] * W; c.moveTo(cx + dx + bx, cy + dy + W * .12); c.ellipse(cx + dx, cy + dy + W * .12, bx, by, 0, 0, Math.PI * 2); }
  }
  function drawCloud(c, cx, cy, cl, W, a, sx, sy) {
    if (a < .01) return;
    c.fillStyle = "rgba(20,40,80," + (.16 * a) + ")"; cloudPath(c, cx, cy, cl, W, sx, sy); c.fill();
    cloudPath(c, cx, cy, cl, W, 0, 0);
    c.strokeStyle = "rgba(31,45,77," + (.28 * a) + ")"; c.lineWidth = 6; c.lineJoin = "round"; c.stroke();
    c.fillStyle = "rgba(196,213,233," + a + ")"; c.fill();
    c.fillStyle = "rgba(255,255,255," + a + ")"; cloudPath(c, cx, cy, cl, W, 0, 0, true); c.fill();
    const [x0, y0, r0] = cl.puffs[2];
    c.fillStyle = "rgba(255,255,255," + (.9 * a) + ")"; c.beginPath(); c.ellipse(cx + x0 * W - r0 * W * .35, cy + y0 * W - r0 * W * .45, r0 * W * .22, r0 * W * .1, -.5, 0, Math.PI * 2); c.fill();
  }

  let base = null, vw = 1, vh = 1, dpr = 1, last = 0, tNow = 0;
  const st = { shipNode: 0, sail: null, visible: 0, cleared: 0, focus: null, zoom: 1, pad: 0, follow: false, cam: null, fog: [0, 1, 1, 1, 1], done: new Set() };
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function resize() {
    vw = cv.clientWidth || innerWidth; vh = cv.clientHeight || innerHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  }
  function init() {
    resize(); addEventListener("resize", resize);
    const q = Math.min(1.6, Math.max(1, (window.devicePixelRatio || 1) * .8));
    base = document.createElement("canvas"); base.width = Math.round(MW * q); base.height = Math.round(MH * q);
    const b = base.getContext("2d"); b.setTransform(q, 0, 0, q, 0, 0); drawBase(b);
    requestAnimationFrame(frame);
  }
  function shipPos() {
    if (st.sail) return along(ROUTES[st.sail.seg], ease(Math.min(1, (performance.now() - st.sail.t0) / st.sail.dur)));
    const d = DOCKS[st.shipNode]; return { x: d[0], y: d[1], dx: 1 };
  }
  function zoomFor(i) {
    const s0 = Math.max(vw / MW, vh / MH);
    const free = Math.max(180, vh - st.pad - 90), need = i == null ? 760 : ISL[i].r * 3.4;
    return Math.max(1, Math.min(2.1, Math.min(vw / need, free / need) / s0));
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    tNow = reduceMotion ? 3 : now / 1000;
    if (st.sail && now - st.sail.t0 >= st.sail.dur) {
      const sl = st.sail; st.sail = null; st.shipNode = sl.to; st.done.add(sl.key); if (sl.onDone) sl.onDone();
    }
    for (let i = 0; i < 5; i++) { const target = i > st.visible ? 1 : 0; st.fog[i] += (target - st.fog[i]) * (1 - Math.exp(-dt * 1.5)); if (Math.abs(st.fog[i] - target) < .003) st.fog[i] = target; }
    const s0 = Math.max(vw / MW, vh / MH), sp = shipPos();
    let tx, ty, tz;
    if (st.sail || st.follow) { tx = sp.x; ty = sp.y - 40; tz = Math.min(1.3, zoomFor(null)); }
    else if (st.focus != null) { const I = ISL[st.focus]; tx = I.x; ty = I.y + 50; tz = st.zoom === "fit" ? zoomFor(st.focus) : st.zoom; }
    else { tz = typeof st.zoom === "number" ? st.zoom : 1; if (vw / (s0 * tz) < MW * .9) { tx = sp.x + 180; ty = sp.y - 160; } else { tx = MW / 2; ty = MH / 2; } }
    if (!st.cam) st.cam = { x: tx, y: ty, z: tz };
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * (st.sail ? 4 : 2.4));
    st.cam.x += (tx - st.cam.x) * k; st.cam.y += (ty - st.cam.y) * k; st.cam.z += (tz - st.cam.z) * k;
    const sc = s0 * st.cam.z, viewW = vw / sc, viewH = vh / sc, MY = 420;
    let cx = st.cam.x, cy = st.cam.y + (st.pad / 2) / sc;
    cx = viewW >= MW ? MW / 2 : Math.max(viewW / 2, Math.min(MW - viewW / 2, cx));
    cy = Math.max(viewH / 2 - (viewH >= MH ? 0 : 60), Math.min(MH - viewH / 2 + MY, cy));
    const ox = cx - viewW / 2, oy = cy - viewH / 2, S = sc * dpr;
    draw(ox, oy, sc, S, sp);
  }
  function draw(ox, oy, sc, S, sp) {
    const t = tNow;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#196aa9"; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!base) return;
    ctx.setTransform(S, 0, 0, S, -ox * S, -oy * S);
    ctx.drawImage(base, 0, 0, MW, MH);
    // shore surf
    ctx.lineWidth = 4;
    ISL.forEach((I, i) => { for (let k = 0; k < 2; k++) { const p = (t * .22 + k * .5 + i * .17) % 1, a = (1 - p) * .55 * Math.min(1, p * 8);
      ctx.strokeStyle = "rgba(255,255,255," + a + ")"; blobPath(ctx, I, 1.08 + p * .22); ctx.stroke(); } });
    // swell
    ctx.lineCap = "round"; ctx.lineWidth = 3;
    for (const w of WAVES) { if (w.x < ox - 30 || w.x > ox + vw / sc + 30 || w.y < oy - 30 || w.y > oy + vh / sc + 30) continue;
      const a = (Math.sin(t * .9 + w.ph) + 1) / 2; if (a < .2) continue;
      const x = w.x + Math.sin(t * .3 + w.ph) * 6;
      ctx.strokeStyle = "rgba(255,255,255," + (a * .5) + ")";
      ctx.beginPath(); ctx.moveTo(x - w.w, w.y); ctx.quadraticCurveTo(x - w.w / 2, w.y - 6, x, w.y); ctx.quadraticCurveTo(x + w.w / 2, w.y - 6, x + w.w, w.y); ctx.stroke(); }
    // route
    const dashLine = (col, w, dash, off, alpha) => { ctx.globalAlpha = alpha; ctx.setLineDash(dash); ctx.lineDashOffset = off; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(31,45,77,.5)"; ctx.lineWidth = w + 5; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; };
    const wakeGlow = () => { ctx.setLineDash([]); ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.lineWidth = 22; ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 12; ctx.stroke(); };
    const chevrons = (R, a, b) => {
      const step = 72, start = a * R.total, end = b * R.total;
      for (let d = start + ((t * 46) % step); d < end - 12; d += step) {
        const p = along(R, d / R.total), q = along(R, Math.min(1, (d + 6) / R.total)), ang = Math.atan2(q.y - p.y, q.x - p.x);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.globalAlpha = Math.max(0, Math.min(1, (d - start) / 40, (end - d) / 40));
        ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(-7, -10); ctx.lineTo(5, 0); ctx.lineTo(-7, 10);
        ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 11; ctx.stroke(); ctx.strokeStyle = "#ffc93c"; ctx.lineWidth = 5.5; ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    ROUTES.forEach((R, k) => {
      if (st.sail && st.sail.seg === k) {
        const f = ease(Math.min(1, (performance.now() - st.sail.t0) / st.sail.dur));
        partPath(R, 0, f); wakeGlow(); dashLine("#ffffff", 6, [18, 13], 0, 1);
        partPath(R, f, 1); dashLine("#ffe08a", 4, [12, 12], -t * 30, .85); chevrons(R, f, 1);
      } else if (k < st.shipNode) { partPath(R, 0, 1); wakeGlow(); dashLine("#ffffff", 6, [18, 13], 0, 1); }
      else if (k === st.shipNode && k <= st.visible) { partPath(R, 0, 1); dashLine("#ffe08a", 4, [12, 12], -t * 30, .85); chevrons(R, 0, 1); }
      else { partPath(R, 0, 1); dashLine("#ffffff", 4, [5, 15], 0, .32); }
    });
    // lighthouse beam
    if (st.fog[4] < .6) { const C = ISL[4], lx = C.x + 22, ly = C.y - 65, a = t * 1.1;
      const gr = ctx.createRadialGradient(lx, ly, 4, lx, ly, 300); gr.addColorStop(0, "rgba(255,236,150," + (.5 * (1 - st.fog[4])) + ")"); gr.addColorStop(1, "rgba(255,236,150,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.arc(lx, ly, 300, a - .16, a + .16); ctx.closePath(); ctx.fill(); }
    // planted flags on cleared islands
    ISL.forEach((I, i) => { if (i >= st.cleared) return;
      const fx = I.x + FLAGPT[i][0] * I.r, fy = I.y + FLAGPT[i][1] * I.r, wave = Math.sin(t * 5 + i) * 4;
      ctx.fillStyle = "rgba(20,40,30,.35)"; ctx.beginPath(); ctx.ellipse(fx + 4, fy + 2, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 70); ctx.stroke();
      ctx.fillStyle = "#1f2d4d"; ctx.beginPath(); ctx.moveTo(fx + 2, fy - 70); ctx.quadraticCurveTo(fx + 24, fy - 74 + wave, fx + 46, fy - 68); ctx.lineTo(fx + 44, fy - 42); ctx.quadraticCurveTo(fx + 22, fy - 48 + wave, fx + 2, fy - 44); ctx.closePath(); ctx.fill();
      disc(ctx, fx + 23, fy - 59 + wave / 2, 7, "#ffffff"); disc(ctx, fx + 20, fy - 60 + wave / 2, 1.8, "#1f2d4d"); disc(ctx, fx + 26, fy - 60 + wave / 2, 1.8, "#1f2d4d"); });
    drawShip(sp, t);
    // drifting clouds and their shadows
    CLOUDS.forEach(C => drawCloud(ctx, ((C.x + t * C.v) % (MW + 600)) - 300, C.y, C.cl, C.W, .92, 70, 110));
    // fog of war: cumulus banks that part and thin out when an island is revealed
    ISL.forEach((I, i) => { const a = st.fog[i]; if (a < .01) return; const spread = 1 + (1 - a) * 1.2, shrink = 1 - (1 - a) * .25;
      ctx.fillStyle = "rgba(240,246,255," + (.35 * a) + ")";
      for (const [dx, dy, w] of [[-.4, .78, .9], [.45, .7, .7]]) { ctx.beginPath(); ctx.ellipse(I.x + dx * I.r * spread, I.y + dy * I.r, w * I.r, 12, 0, 0, Math.PI * 2); ctx.fill(); }
      for (const f of FOG[i]) drawCloud(ctx, I.x + f.ox * spread + Math.sin(t * .35 + f.ph) * 6, I.y + f.oy * spread + Math.cos(t * .3 + f.ph) * 3, f.cl, f.W * shrink, a, 10, 18);
    });
    // screen space: labels, marker, vignette
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toS = (x, y) => [(x - ox) * sc, (y - oy) * sc];
    ctx.textBaseline = "middle";
    ISL.forEach((I, i) => {
      const [x, y] = toS(I.x, I.y - I.r - 34); if (x < -150 || x > vw + 150 || y < -40 || y > vh + 40) return;
      const known = i <= st.visible, done = i < st.cleared, now = known && !done && i === st.visible;
      const text = known ? ISL_NAMES[i] : "???";
      ctx.font = '15px "Lilita One", "Arial Rounded MT Bold", sans-serif';
      const w = ctx.measureText(text).width + 52, hh = 30, x0 = x - w / 2, y0 = y - hh / 2;
      ctx.fillStyle = "rgba(31,45,77,.92)"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, w, hh, 15) : ctx.rect(x0, y0, w, hh); ctx.fill(); ctx.stroke();
      const bx = x0 + 15; disc(ctx, bx, y, 10, done ? "#3fbf6a" : now ? "#ffc93c" : "#6b7a9c");
      if (done) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(bx - 5, y); ctx.lineTo(bx - 1, y + 4); ctx.lineTo(bx + 5, y - 4); ctx.stroke(); }
      else { ctx.fillStyle = now ? "#1f2d4d" : "#dfe6f3"; ctx.textAlign = "center"; ctx.font = '12px "Lilita One", sans-serif'; ctx.fillText(i < 4 ? String(i + 1) : "★", bx, y + 1); }
      ctx.fillStyle = known ? "#ffffff" : "#b9c4dc"; ctx.textAlign = "left"; ctx.font = '15px "Lilita One", "Arial Rounded MT Bold", sans-serif'; ctx.fillText(text, x0 + 32, y + 1);
      if (now) { const by = y - 34 + Math.sin(t * 4) * 5;
        ctx.fillStyle = "#ffc93c"; ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, by - 15); ctx.lineTo(x + 13, by); ctx.lineTo(x, by + 15); ctx.lineTo(x - 13, by); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1f2d4d"; ctx.textAlign = "center"; ctx.font = '17px "Lilita One", sans-serif'; ctx.fillText("!", x, by + 1); }
    });
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * .45, vw / 2, vh / 2, Math.max(vw, vh) * .78);
    vg.addColorStop(0, "rgba(10,30,60,0)"); vg.addColorStop(1, "rgba(10,30,60,.32)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
  }
  function sailShape(x, y0, y1, w, b) {
    const l = x - w / 2, r = x + w / 2, my = (y0 + y1) / 2;
    ctx.beginPath(); ctx.moveTo(l, y0); ctx.quadraticCurveTo(x, y0 - 4, r, y0);
    ctx.quadraticCurveTo(r + b, my, r - 2, y1); ctx.quadraticCurveTo(x + b * .3, y1 + b * .5, l + 2, y1);
    ctx.quadraticCurveTo(l + b * .55, my, l, y0); ctx.closePath();
  }
  function drawSail(x, y0, y1, w, b) {
    sailShape(x, y0, y1, w, b);
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2 + b, 0); g.addColorStop(0, "#eadcb8"); g.addColorStop(.45, "#fffaf0"); g.addColorStop(1, "#dccaa0");
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); sailShape(x, y0, y1, w, b); ctx.clip();
    ctx.strokeStyle = "rgba(150,120,70,.35)"; ctx.lineWidth = 1.5;
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + k * w / 6, y0); ctx.quadraticCurveTo(x + k * w / 6 + b * .6, (y0 + y1) / 2, x + k * w / 6 + b * .2, y1); ctx.stroke(); }
    ctx.restore();
    ctx.lineCap = "round"; ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(x - w / 2 - 4, y0 - 1); ctx.lineTo(x + w / 2 + 4, y0 - 1); ctx.stroke();
    ctx.strokeStyle = "#8a5a32"; ctx.lineWidth = 3.5; ctx.stroke();
  }
  function drawShip(sp, t) {
    let face = 1;
    if (st.sail) face = sp.dx < 0 ? -1 : 1;
    else if (st.shipNode < ROUTES.length) { const R = ROUTES[st.shipNode]; face = R.pts[6][0] < R.pts[0][0] ? -1 : 1; }
    const moving = !!st.sail, b = moving ? 11 : 6, wv = Math.sin(t * 6) * 3;
    ctx.save(); ctx.translate(sp.x, sp.y + Math.sin(t * 2.2) * 3); ctx.rotate(Math.sin(t * 1.7) * .045);
    ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.beginPath(); ctx.ellipse(4, 12, 76, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(face, 1);
    if (moving) { ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) { const o = ((t * 2 + k / 3) % 1); ctx.globalAlpha = 1 - o; ctx.beginPath(); ctx.moveTo(-66 - o * 70, 6 - o * 10); ctx.lineTo(-96 - o * 70, 2 - o * 16); ctx.moveTo(-66 - o * 70, 12 + o * 8); ctx.lineTo(-96 - o * 70, 16 + o * 14); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,.75)"; for (const [dx, dy, r] of [[72, 4, 5], [78, -2, 3.5], [66, 8, 4]]) disc(ctx, dx + Math.sin(t * 8 + dx) * 2, dy, r, "rgba(255,255,255,.75)"); }
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // rigging, behind everything
    ctx.strokeStyle = "rgba(31,45,77,.55)"; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(98, -46); ctx.lineTo(42, -106); ctx.lineTo(6, -132); ctx.lineTo(-36, -100); ctx.lineTo(-62, -40);
    for (const [mx, my] of [[42, -106], [6, -132], [-36, -100]]) { const dk = mx < -20 ? -38 : -22; ctx.moveTo(mx - 15, dk); ctx.lineTo(mx, my + 30); ctx.moveTo(mx + 15, dk); ctx.lineTo(mx, my + 30); }
    ctx.stroke();
    // bowsprit and masts
    const spar = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 7.5; ctx.stroke(); ctx.strokeStyle = "#6b4020"; ctx.lineWidth = 4; ctx.stroke(); };
    spar(60, -24, 100, -48);
    spar(-36, -38, -36, -102); spar(6, -22, 6, -134); spar(42, -22, 42, -108);
    // sails: mizzen, main (course + topsail), fore (course + topsail)
    drawSail(-36, -92, -50, 32, b);
    drawSail(6, -124, -98, 34, b * .8);
    drawSail(6, -92, -40, 48, b);
    drawSail(42, -100, -76, 26, b * .8);
    drawSail(42, -72, -38, 36, b);
    const ex = 6 + b * .3, ey = -67;
    disc(ctx, ex, ey, 10.5, "#ff6b4a"); ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 2.5; ctx.stroke();
    disc(ctx, ex, ey - 1.5, 5, "#ffffff"); ctx.fillStyle = "#ffffff"; ctx.fillRect(ex - 3, ey + 1.5, 6, 4);
    disc(ctx, ex - 2, ey - 2, 1.4, "#1f2d4d"); disc(ctx, ex + 2, ey - 2, 1.4, "#1f2d4d");
    // hull: raised stern castle, sweeping bow
    const hull = () => { ctx.beginPath(); ctx.moveTo(-66, -40); ctx.lineTo(-34, -40); ctx.lineTo(-30, -22); ctx.lineTo(58, -22);
      ctx.quadraticCurveTo(68, -24, 75, -37); ctx.quadraticCurveTo(75, -6, 50, 10); ctx.quadraticCurveTo(0, 20, -46, 14); ctx.quadraticCurveTo(-62, 8, -66, -40); ctx.closePath(); };
    hull(); const hg = ctx.createLinearGradient(0, -40, 0, 16); hg.addColorStop(0, "#a56b37"); hg.addColorStop(1, "#5a3216"); ctx.fillStyle = hg; ctx.fill();
    ctx.save(); hull(); ctx.clip();
    ctx.fillStyle = "#3e2410"; ctx.fillRect(-70, 3, 150, 20);
    ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1.5; for (const y of [-30, -2]) { ctx.beginPath(); ctx.moveTo(-66, y); ctx.lineTo(74, y); ctx.stroke(); }
    ctx.strokeStyle = "#ffc93c"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-66, -15); ctx.lineTo(58, -15); ctx.quadraticCurveTo(66, -16, 72, -24); ctx.stroke();
    ctx.restore();
    hull(); ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 4; ctx.stroke();
    for (const gx of [-24, -8, 8, 24, 40]) { ctx.fillStyle = "#1f2d4d"; ctx.fillRect(gx - 4, -9, 8, 7); ctx.strokeStyle = "#ffc93c"; ctx.lineWidth = 1.5; ctx.strokeRect(gx - 4, -9, 8, 7); }
    for (const wx of [-60, -52, -44]) { ctx.fillStyle = "#ffe27a"; ctx.fillRect(wx - 2.5, -33, 5, 7); ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 1.5; ctx.strokeRect(wx - 2.5, -33, 5, 7); }
    ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-66, -46); ctx.lineTo(-36, -46);
    for (let x = -64; x <= -38; x += 6.5) { ctx.moveTo(x, -46); ctx.lineTo(x, -40); } ctx.stroke();
    ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-66, -40); ctx.lineTo(-70, -52); ctx.stroke();
    disc(ctx, -70, -55, 6, "rgba(255,226,122,.35)"); disc(ctx, -70, -55, 3.5, "#ffe27a");
    disc(ctx, 74, -36, 4, "#ffc93c"); ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 2; ctx.stroke();
    // flags: Jolly Roger on the mainmast, pennants fore and aft
    ctx.fillStyle = "#1f2d4d"; ctx.beginPath(); ctx.moveTo(7, -134); ctx.quadraticCurveTo(20, -138 + wv, 33, -132); ctx.lineTo(32, -117); ctx.quadraticCurveTo(19, -121 + wv, 7, -119); ctx.closePath(); ctx.fill();
    disc(ctx, 20, -127 + wv / 2, 3.8, "#ffffff"); ctx.fillStyle = "#ffffff"; ctx.fillRect(18, -124.5 + wv / 2, 4, 2.5);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(15, -121 + wv / 2); ctx.lineTo(25, -129 + wv / 2); ctx.moveTo(25, -121 + wv / 2); ctx.lineTo(15, -129 + wv / 2); ctx.stroke();
    for (const [px, py, len] of [[42, -108, 17], [-36, -102, 13]]) {
      ctx.fillStyle = "#ff6b4a"; ctx.strokeStyle = "#1f2d4d"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + len * .6, py + 1 + wv * .6, px + len, py + 3 + wv); ctx.lineTo(px, py + 7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  return {
    init,
    set(o) { for (const k in o) { if (k === "ship") { if (!st.sail) st.shipNode = o.ship; } else st[k] = o[k]; } },
    place(node) { if (st.sail && st.sail.to === node) return; st.sail = null; st.shipNode = node; },
    sail(from, to, key, onDone) {
      if (st.sail && st.sail.key === key) { st.sail.onDone = onDone; return; }
      if (st.done.has(key) || st.shipNode >= to || to !== from + 1 || reduceMotion) {
        if (!st.sail) st.shipNode = Math.max(st.shipNode, to); st.done.add(key); if (onDone) onDone(); return; }
      if (st.sail) { const sl = st.sail; st.sail = null; st.done.add(sl.key); }
      st.shipNode = from;
      st.sail = { seg: from, to, key, t0: performance.now(), dur: 1500 + ROUTES[from].total * 2.4, onDone };
    },
    get sailing() { return !!st.sail; },
  };
})();
World.init();

/* ---------- The challenges ---------- */
function gameRiddle(api) {
  const msg = h("p", { class: "msg", text: "Pick an answer." });
  const opts = h("div", { class: "opts" }, RIDDLE.options.map((opt, i) => h("button", { class: "opt", type: "button", onclick: ev => {
    if (opt === RIDDLE.answer) { api.solve(); return; }
    const b = ev.currentTarget; b.disabled = true; b.classList.add("wrong"); api.penalize(10000);
    msg.textContent = "Not quite. 10 seconds added."; msg.className = "msg err";
  } }, h("span", { class: "letter", text: "ABCD"[i] }), h("span", { text: opt }))));
  return h("div", { class: "game" }, h("div", { class: "scroll-q" }, h("div", { class: "label", text: "The captain's riddle" }), h("p", { class: "q", text: RIDDLE.q })), opts, msg);
}
function gameScramble(api) {
  const letters = SCRAMBLE.shown.split("");
  let picked = [], solved = false, resetT = 0;
  const slots = h("div", { class: "slots", "aria-live": "polite" });
  const msg = h("p", { class: "msg", style: "text-align:center", text: "Hint: " + SCRAMBLE.hint });
  const btns = letters.map((L, i) => h("button", { class: "tile", type: "button", "aria-label": "Letter " + L, onclick: () => pick(i) }, L));
  function draw() {
    slots.replaceChildren(...letters.map((_, k) => h("div", { class: "slot" + (picked[k] != null ? " full" : ""), text: picked[k] != null ? letters[picked[k]] : "" })));
    btns.forEach((b, i) => { b.disabled = solved || picked.includes(i); });
  }
  function pick(i) {
    if (solved || resetT || picked.includes(i) || picked.length >= letters.length) return;
    picked.push(i); draw();
    if (picked.length < letters.length) return;
    const w = picked.map(k => letters[k]).join("");
    if (w === SCRAMBLE.word) { solved = true; draw(); api.solve(); return; }
    api.penalize(5000); msg.textContent = w + " isn't it. 5 seconds added."; msg.className = "msg err"; msg.style.textAlign = "center";
    slots.classList.remove("shake"); void slots.offsetWidth; slots.classList.add("shake");
    resetT = setTimeout(() => { resetT = 0; picked = []; draw(); }, 650);
  }
  const back = () => { if (!solved && !resetT) { picked.pop(); draw(); } };
  const onKey = e => {
    if (e.key === "Backspace") { back(); return; }
    const L = (e.key || "").toUpperCase();
    if (/^[A-Z]$/.test(L)) { const i = letters.findIndex((x, k) => x === L && !picked.includes(k)); if (i >= 0) pick(i); }
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => { document.removeEventListener("keydown", onKey); clearTimeout(resetT); });
  draw();
  return h("div", { class: "game" },
    h("div", { class: "label", style: "text-align:center", text: "Message in a bottle" }), h("div", { class: "bottle-msg", text: SCRAMBLE.shown }),
    slots, h("div", { class: "tiles" }, btns),
    h("div", { class: "row", style: "justify-content:center" },
      h("button", { class: "gbtn small plain", type: "button", onclick: back }, "Undo"),
      h("button", { class: "gbtn small plain", type: "button", onclick: () => { if (!solved && !resetT) { picked = []; draw(); } } }, "Clear")),
    msg);
}
function gameLock(api) {
  const msg = h("p", { class: "msg", text: "Pick the code that opens the chest." });
  const digits = c => h("span", { class: "code" }, c.split("").map(d => h("span", { text: d })));
  const clues = h("table", { class: "clues" }, LOCK.clues.map(([c, t]) => h("tr", null, h("td", null, digits(c)), h("td", { text: t }))));
  const opts = h("div", { class: "lockopts" }, LOCK.options.map(opt => h("button", { class: "lockopt", type: "button", "aria-label": "Try code " + opt, onclick: ev => {
    if (opt === LOCK.answer) { api.solve(); return; }
    ev.currentTarget.disabled = true; api.penalize(10000); msg.textContent = "The lock won't budge. 10 seconds added."; msg.className = "msg err";
  } }, h("span", { class: "wheels" }, opt.split("").map(d => h("span", { text: d }))))));
  return h("div", { class: "game" },
    h("div", { class: "lid" }, h("div", { class: "label", text: "Scratched on the chest lid · no digit repeats" }), h("div", { class: "table-wrap" }, clues)),
    opts, msg);
}

// Shadow Cave: torch-lit search with real shadows (2D visibility polygon, soft edges from three flame samples).
function gameTorch(api, gid) {
  const W = 800, H = 600, START = [400, 545];
  const rand = rng(gid + ":hold:" + uid);
  const crates = [], barrels = [], coins = [], bottles = [], ropes = [];
  const solids = () => crates.concat(barrels);
  const free = (x, y, rad, list) => x > rad + 12 && x < W - rad - 12 && y > rad + 12 && y < H - rad - 12 &&
    (list || solids()).every(o => Math.hypot(o.x - x, o.y - y) > o.r + rad + 16);
  let tries = 0;
  while (crates.length < 7 && tries++ < 600) { const sz = 58 + rand() * 48, x = rand() * W, y = rand() * H;
    if (free(x, y, sz * .72) && Math.hypot(x - START[0], y - START[1]) > 130) { const a = rand() * 6.28;
      crates.push({ x, y, sz, a, r: sz * .72, pts: Array.from({ length: 7 }, (_, k) => { const ang = a + k * Math.PI * 2 / 7, d = sz / 2 * (.8 + rand() * .32); return [x + Math.cos(ang) * d, y + Math.sin(ang) * d]; }) }); } }
  tries = 0;
  while (barrels.length < 6 && tries++ < 600) { const r = 24 + rand() * 14, x = rand() * W, y = rand() * H;
    if (free(x, y, r) && Math.hypot(x - START[0], y - START[1]) > 110) barrels.push({ x, y, r }); }
  const all = () => solids().concat(coins, bottles, ropes);
  let key = null; tries = 0;
  while (!key && tries++ < 2000) { const x = rand() * W, y = rand() * H;
    if (free(x, y, 30) && Math.hypot(x - START[0], y - START[1]) > 280) key = { x, y, a: rand() * Math.PI * 2, r: 22 }; }
  if (!key) key = { x: 80, y: 80, a: .4, r: 22 };
  const scatter = (list, n, rad) => { let t = 0; while (list.length < n && t++ < 800) { const x = rand() * W, y = rand() * H;
    if (free(x, y, rad, all().concat([key]))) list.push({ x, y, r: rad, a: rand() * Math.PI * 2 }); } };
  scatter(coins, 9, 8); scatter(bottles, 3, 18); scatter(ropes, 2, 24);
  const polys = crates.map(c => c.pts).concat(barrels.map(b => Array.from({ length: 12 }, (_, k) => { const ang = k * Math.PI / 6; return [b.x + Math.cos(ang) * b.r, b.y + Math.sin(ang) * b.r]; })));
  const border = [[0, 0], [W, 0], [W, H], [0, H]];
  const edgesOf = p => p.map((q, k) => { const n = p[(k + 1) % p.length]; return [q[0], q[1], n[0], n[1]]; });
  const inPoly = (x, y, p) => { let ins = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
  function visPoly(lx, ly) {
    const active = polys.filter(p => !inPoly(lx, ly, p)), segs = edgesOf(border).concat(...active.map(edgesOf)), pts = border.concat(...active), out = [];
    for (const p of pts) { const base = Math.atan2(p[1] - ly, p[0] - lx);
      for (const a of [base - 1e-4, base, base + 1e-4]) { const dx = Math.cos(a), dy = Math.sin(a); let best = Infinity;
        for (const [x1, y1, x2, y2] of segs) { const sx = x2 - x1, sy = y2 - y1, den = dx * sy - dy * sx; if (Math.abs(den) < 1e-9) continue;
          const t = ((x1 - lx) * sy - (y1 - ly) * sx) / den, u = ((x1 - lx) * dy - (y1 - ly) * dx) / den; if (t > 0 && u >= 0 && u <= 1 && t < best) best = t; }
        if (best < Infinity) out.push([a, lx + dx * best, ly + dy * best]); } }
    return out.sort((p, q) => p[0] - q[0]);
  }
  function blocked(lx, ly, x, y) {
    const segs = [].concat(...polys.filter(p => !inPoly(lx, ly, p)).map(edgesOf)), dx = x - lx, dy = y - ly;
    return segs.some(([x1, y1, x2, y2]) => { const sx = x2 - x1, sy = y2 - y1, den = dx * sy - dy * sx; if (Math.abs(den) < 1e-9) return false;
      const t = ((x1 - lx) * sy - (y1 - ly) * sx) / den, u = ((x1 - lx) * dy - (y1 - ly) * dx) / den; return t > 0 && t < 1 && u >= 0 && u <= 1; });
  }
  const cv = h("canvas", { class: "hold", "aria-label": "A pitch-dark cave. Move the torch to search for the captain's compass." }), ctx = cv.getContext("2d");
  const scene = document.createElement("canvas"), dark = document.createElement("canvas"), sctx = scene.getContext("2d"), dctx = dark.getContext("2d");
  let scale = 1;
  function drawScene() {
    const c = sctx, g = rng(gid + ":grain");
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.fillStyle = "#3a352e"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { c.fillStyle = g() < .5 ? "#4a4236" : "#2c2924"; c.globalAlpha = .55; c.beginPath(); c.ellipse(g() * W, g() * H, 40 + g() * 90, 20 + g() * 50, g() * 3, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    for (let i = 0; i < 1100; i++) disc(c, g() * W, g() * H, .8 + g() * 3.2, g() < .55 ? "#00000038" : "#ffffff12");
    for (const p of ropes) { c.fillStyle = "#16242c"; c.beginPath(); c.ellipse(p.x, p.y, 28, 18, p.a, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#9fc3cf40"; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x - 4, p.y - 3, 16, 8, p.a, 3.6, 5.4); c.stroke(); }
    for (const o of coins) { c.save(); c.translate(o.x, o.y); c.rotate(o.a); c.fillStyle = "#e8d6c0";
      c.beginPath(); c.moveTo(0, 6); c.arc(0, 6, 11, Math.PI * 1.15, Math.PI * 1.85); c.closePath(); c.fill();
      c.strokeStyle = "#b39a7c"; c.lineWidth = 1.2; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(0, 6); c.lineTo(k * 4, -4); c.stroke(); } c.restore(); }
    for (const b of bottles) { c.save(); c.translate(b.x, b.y); c.rotate(b.a); c.fillStyle = "#d8d0bc"; c.fillRect(-13, -2.5, 26, 5);
      for (const [bx, by] of [[-14, -3], [-14, 3], [14, -3], [14, 3]]) disc(c, bx, by, 4, "#d8d0bc"); c.restore(); }
    c.save(); c.translate(key.x, key.y); c.rotate(key.a);
    disc(c, 0, 0, 15, "#b8862a"); disc(c, 0, 0, 11, "#f3e6c0");
    c.fillStyle = "#c0392b"; c.beginPath(); c.moveTo(0, -10); c.lineTo(3, 0); c.lineTo(-3, 0); c.closePath(); c.fill();
    c.fillStyle = "#2b1e10"; c.beginPath(); c.moveTo(0, 10); c.lineTo(3, 0); c.lineTo(-3, 0); c.closePath(); c.fill();
    c.fillStyle = "#e3b84c"; c.fillRect(-3, -19, 6, 5); c.restore();
    for (const b of barrels) { disc(c, b.x + 4, b.y + 6, b.r, "#0009");
      const gr = c.createRadialGradient(b.x - b.r * .35, b.y - b.r * .35, 2, b.x, b.y, b.r); gr.addColorStop(0, "#827d74"); gr.addColorStop(1, "#3b3935");
      disc(c, b.x, b.y, b.r, gr); }
    for (const k of crates) { const p = k.pts;
      c.fillStyle = "#0009"; c.beginPath(); c.moveTo(p[0][0] + 5, p[0][1] + 7); for (const q of p) c.lineTo(q[0] + 5, q[1] + 7); c.closePath(); c.fill();
      const gr = c.createLinearGradient(k.x - k.sz / 2, k.y - k.sz / 2, k.x + k.sz / 2, k.y + k.sz / 2); gr.addColorStop(0, "#77716a"); gr.addColorStop(1, "#33302c");
      c.fillStyle = gr; c.beginPath(); c.moveTo(p[0][0], p[0][1]); for (const q of p) c.lineTo(q[0], q[1]); c.closePath(); c.fill();
      c.strokeStyle = "#1c1a17"; c.lineWidth = 3; c.stroke(); }
  }
  function resize() {
    const w = cv.clientWidth; if (!w) return;
    const d = Math.min(2, window.devicePixelRatio || 1), pw = Math.round(w * d), ph = Math.round(w * d * H / W);
    for (const c of [cv, scene, dark]) { c.width = pw; c.height = ph; }
    scale = pw / W; drawScene();
  }
  const ro = new ResizeObserver(resize); ro.observe(cv);
  let tx = START[0], ty = START[1], lx = tx, ly = ty, flick = 0, foundAt = 0, raf = 0, alive = true;
  const t0 = performance.now();
  const msg = h("p", { class: "msg", style: "text-align:center", text: "Move your magical torch around the cave." });
  const toLocal = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  cv.addEventListener("pointermove", e => { [tx, ty] = toLocal(e); });
  cv.addEventListener("pointerdown", e => {
    e.preventDefault(); if (foundAt) return;
    const [x, y] = toLocal(e); tx = x; ty = y;
    const lit = (px, py) => Math.hypot(px - lx, py - ly) < 150 && !blocked(lx, ly, px, py);
    if (Math.hypot(x - key.x, y - key.y) < 32 && lit(key.x, key.y)) {
      foundAt = performance.now(); msg.textContent = "You found the captain's compass!"; msg.className = "msg"; msg.style.color = "var(--leaf-dk)";
      const t = setTimeout(() => api.solve(), 1300); cleanups.push(() => clearTimeout(t)); return;
    }
    const hit = (list, rad) => list.some(o => Math.hypot(x - o.x, y - o.y) < rad && lit(o.x, o.y));
    if (hit(coins, 16)) msg.textContent = "Just a seashell. Keep looking.";
    else if (hit(bottles, 22)) msg.textContent = "Old bones. Keep looking.";
    else if (hit(ropes, 26)) msg.textContent = "A tide pool. Nothing in it.";
    else if (Math.hypot(x - key.x, y - key.y) < 32) msg.textContent = "Something's there, but it's too dark to see. Bring the torch closer.";
  });
  function frame(now) {
    if (!alive) return; raf = requestAnimationFrame(frame); if (!cv.width) return;
    const t = now / 1000;
    lx += (tx - lx) * .22; ly += (ty - ly) * .22;
    flick = flick * .86 + (Math.random() - .5) * .07;
    const f = 1 + .045 * Math.sin(t * 11.3) + .03 * Math.sin(t * 23.1 + 1.7) + flick, R = 200 * f;
    const jx = Math.sin(t * 7.1) * 1.6, jy = Math.cos(t * 5.3) * 1.6, reveal = foundAt ? Math.min(1, (now - foundAt) / 900) : 0;
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.globalCompositeOperation = "source-over"; dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = "rgba(3,5,9," + (.985 * (1 - reveal)) + ")"; dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.setTransform(scale, 0, 0, scale, 0, 0); dctx.globalCompositeOperation = "destination-out";
    for (const [ox, oy] of [[0, 0], [-7, 4], [6, 5]]) { const px = lx + jx + ox, py = ly + jy + oy, poly = visPoly(px, py); if (!poly.length) continue;
      const g = dctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, "rgba(0,0,0,.62)"); g.addColorStop(.18, "rgba(0,0,0,.55)"); g.addColorStop(.45, "rgba(0,0,0,.3)"); g.addColorStop(.75, "rgba(0,0,0,.1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      dctx.fillStyle = g; dctx.beginPath(); dctx.moveTo(poly[0][1], poly[0][2]); for (const p of poly) dctx.lineTo(p[1], p[2]); dctx.closePath(); dctx.fill(); }
    const gt = dctx.createRadialGradient(lx, ly, 0, lx, ly, R); gt.addColorStop(0, "rgba(0,0,0,.9)"); gt.addColorStop(.5, "rgba(0,0,0,.45)"); gt.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = gt; for (const p of polys) { dctx.beginPath(); dctx.moveTo(p[0][0], p[0][1]); for (const q of p) dctx.lineTo(q[0], q[1]); dctx.closePath(); dctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.drawImage(scene, 0, 0); ctx.drawImage(dark, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.globalCompositeOperation = "lighter";
    const warm = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * .9); warm.addColorStop(0, "rgba(120,220,255," + (.16 * f) + ")"); warm.addColorStop(1, "rgba(80,160,255,0)");
    ctx.fillStyle = warm; ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
    if (!foundAt && now - t0 > 45000 && (t % 2.6) < .3) { const k = 1 - Math.abs((t % 2.6) - .15) / .15;
      ctx.strokeStyle = "rgba(255,240,190," + k + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(key.x - 12, key.y); ctx.lineTo(key.x + 12, key.y); ctx.moveTo(key.x, key.y - 12); ctx.lineTo(key.x, key.y + 12); ctx.stroke(); }
    if (foundAt) { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "rgba(255,201,60," + (1 - reveal * .5) + ")"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(key.x, key.y, 34 + reveal * 10, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalCompositeOperation = "lighter";
    const fl = ctx.createRadialGradient(lx, ly - 4, 0, lx, ly - 4, 18 * f);
    fl.addColorStop(0, "rgba(240,255,255,.95)"); fl.addColorStop(.35, "rgba(120,230,255,.75)"); fl.addColorStop(1, "rgba(60,140,255,0)");
    ctx.fillStyle = fl; ctx.beginPath(); ctx.ellipse(lx, ly - 6, 11 * f, 18 * f, Math.sin(t * 9) * .12, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  raf = requestAnimationFrame(frame);
  cleanups.push(() => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); });
  return h("div", { class: "game" }, cv, msg);
}

// Captain's Cove: drag the 9 pieces into the frame.
function gamePuzzle(api, gid) {
  const E = edgeSigns(gid), UH = 164, BX = 14, BY = 2, CELL = 72 / GRID, SNAP = CELL / 4;
  const rand = rng(gid + ":scatter:" + uid), placedKey = api.lsKey + ":placed";
  let placedSaved = []; try { placedSaved = JSON.parse(lsGet(placedKey) || "[]"); } catch {}
  const wrap = h("div", { class: "jig" }), guide = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
    guide.push(s("path", { d: piecePath(r, c, E), transform: "translate(" + c * 100 + " " + r * 100 + ")", fill: "none", stroke: "#9cc3d3", "stroke-width": "2", "stroke-dasharray": "6 5" }));
  wrap.append(h("div", { class: "jig-board" }, s("svg", { viewBox: "0 0 " + GRID * 100 + " " + GRID * 100, "aria-hidden": "true" }, guide)), h("div", { class: "jig-tray", text: "Your portrait pieces" }));
  const count = h("span", { class: "pill" });
  let z = 10, placedN = 0, finished = false;
  const order = []; for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) order.push([r, c]);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const setPos = p => { p.el.style.left = (p.x - .3 * CELL) + "%"; p.el.style.top = ((p.y - .3 * CELL) / UH * 100) + "%"; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const updateCount = () => { count.textContent = placedN + " / " + GRID * GRID + " placed"; };
  function lockIn(p, animate) {
    p.placed = true; p.x = BX + p.c * CELL; p.y = BY + p.r * CELL; setPos(p);
    p.el.classList.add("placed"); p.el.style.zIndex = 1;
    if (animate) { p.el.classList.remove("snap"); void p.el.offsetWidth; p.el.classList.add("snap"); }
    placedN++; updateCount();
  }
  for (const [r, c] of order) {
    const idx = r * GRID + c, p = { r, c, x: 3 + rand() * (94 - CELL), y: 80 + rand() * (UH - 3 - CELL - 80), placed: false };
    const hit = s("path", { d: piecePath(r, c, E), class: "hit", fill: "transparent", "pointer-events": "all" });
    p.el = h("div", { class: "jp", style: "width:" + 1.6 * CELL + "%;z-index:" + (++z) }, s("svg", { viewBox: "-30 -30 160 160", "aria-label": "Portrait piece" }, pieceGroup(r, c, E, true), hit));
    hit.addEventListener("pointerdown", ev => {
      if (p.placed || finished) return; ev.preventDefault();
      try { hit.setPointerCapture(ev.pointerId); } catch {}
      const rect = wrap.getBoundingClientRect(), u = rect.width / 100;
      const ox = (ev.clientX - rect.left) / u - p.x, oy = (ev.clientY - rect.top) / u - p.y;
      p.el.style.zIndex = ++z; p.el.classList.add("drag");
      const move = e => { p.x = clamp((e.clientX - rect.left) / u - ox, -2, 100 - CELL + 2); p.y = clamp((e.clientY - rect.top) / u - oy, -2, UH - CELL + 2); setPos(p); };
      const up = () => {
        hit.removeEventListener("pointermove", move); hit.removeEventListener("pointerup", up); hit.removeEventListener("pointercancel", up);
        p.el.classList.remove("drag");
        if (Math.hypot(p.x - (BX + p.c * CELL), p.y - (BY + p.r * CELL)) < SNAP) {
          lockIn(p, true); placedSaved.push(idx); lsSet(placedKey, JSON.stringify(placedSaved));
          if (placedN === GRID * GRID) { finished = true; setTimeout(() => api.solve(), 400); }
        }
      };
      hit.addEventListener("pointermove", move); hit.addEventListener("pointerup", up); hit.addEventListener("pointercancel", up);
    });
    setPos(p); wrap.append(p.el);
    if (placedSaved.includes(idx)) lockIn(p, false);
  }
  updateCount();
  if (placedN === GRID * GRID) { finished = true; setTimeout(() => api.solve(), 0); }
  return h("div", { class: "game" }, h("div", { class: "row between" }, h("span", { class: "label", text: "Rebuild the portrait" }), count), wrap);
}
