// Sample points have to cover their band: band area no patch reaches cannot be
// scored, so a tile there is invisible. Keep the hand-calibrated points and add
// the fewest extra ones that close the gaps worth closing.
//
//   node add_points.mjs <out.json> [max points per link]
//
// Writes a candidate coords.json. Score it with evaluate.mjs AND
// stress_warp.mjs before shipping: every point added is coverage of somewhere a
// tile can be against one more place an empty link can fire.
import { readFileSync, writeFileSync } from "fs";
import { LINK_MASKS } from "./linkMasks.mjs";
import {
  CANONICAL_SIZE as S,
  MAX_UNSCORED_BAND_CELLS,
  bandCells,
  closestOnPoly,
  unscoredCells,
} from "./classifier.mjs";

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node add_points.mjs <out.json> [max points per link]");
  process.exit(1);
}
const MAX_POINTS = Number(process.argv[3] || 4);
const base = JSON.parse(readFileSync("./coords.json", "utf8"));

const count = (coords) =>
  Object.values(coords).reduce((a, v) => a + (Array.isArray(v[0]) ? v.length : 1), 0);

const out = {};
for (const [id, pos] of Object.entries(base)) {
  const mask = LINK_MASKS[id];
  const pts = (Array.isArray(pos[0]) ? pos : [pos]).map(([nx, ny]) => [
    Math.round(nx * S),
    Math.round(ny * S),
  ]);
  if (mask) {
    const cells = bandCells(mask);
    for (let k = pts.length; k < MAX_POINTS; k++) {
      const missed = unscoredCells(cells, pts);
      if (missed.length < MAX_UNSCORED_BAND_CELLS) break;
      // The missing cell furthest from every point placed so far, pulled onto
      // the route. Taking the centre of what is missing instead stalls: on a
      // long band it lands between the two ends and covers neither.
      let far = missed[0], farD = -1;
      for (const c of missed) {
        const d = Math.min(...pts.map((p) => Math.hypot(c[0] - p[0], c[1] - p[1])));
        if (d > farD) { farD = d; far = c; }
      }
      const q = closestOnPoly(far[0], far[1], mask.pts);
      pts.push([Math.round(q.x), Math.round(q.y)]);
      console.log(`${id} +${missed.length} cells -> ${(q.x / S).toFixed(5)},${(q.y / S).toFixed(5)}`);
    }
    const left = unscoredCells(cells, pts).length;
    if (left >= MAX_UNSCORED_BAND_CELLS) {
      console.log(`${id} STILL ${left} of ${cells.length} unscored at ${MAX_POINTS} points`);
    }
  }
  const norm = pts.map((p) => [+(p[0] / S).toFixed(5), +(p[1] / S).toFixed(5)]);
  out[id] = norm.length > 1 ? norm : norm[0];
}
console.log(`\nsample points: ${count(base)} -> ${count(out)}`);
writeFileSync(OUT, JSON.stringify(out, null, 1));
