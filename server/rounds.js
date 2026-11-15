// Must match ROUNDS in public/js/core.js (keys and time caps).
export const ROUNDS = [
  { key: "r1", cap: 90000 },   // Riddle Reef
  { key: "r2", cap: 90000 },   // Shadow Cave Island
  { key: "r3", cap: 90000 },   // Scramble Shores
  { key: "r4", cap: 90000 },   // Lockdown Island
  { key: "r5", cap: 180000 },  // Captain's Cove (portrait)
];
export const missFor = R => R.cap + 30000;       // not finishing counts as cap + 30 s
export const RESULT_GRACE_MS = 30000;            // results still accepted this long after the host ends a round

export function computeStandings(players) {
  return players.map(p => {
    let total = 0, solved = 0;
    for (const R of ROUNDS) {
      const t = p.times && p.times[R.key];
      total += t != null ? t : missFor(R);
      if (t != null && !(p.missed && p.missed[R.key])) solved++;
    }
    return { id: p._id, name: p.name || "Unnamed pirate", total, solved, joinedAt: p.joinedAt || 0 };
  }).sort((a, b) => a.total - b.total || b.solved - a.solved || a.joinedAt - b.joinedAt);
}
