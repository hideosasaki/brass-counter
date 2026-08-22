// Sample points have to read their band: wherever a tile sits on a route, some
// patch has to see enough of it to answer for it without asking, and where none
// does the link is either questioned or read as empty. Keep the hand-calibrated
// points and add the fewest extra ones that bring every band up to
// MIN_BAND_TILE_FRAC.
//
//   node add_points.mjs <out.json> [max points per link]
//
// Writes a candidate coords.json. Score it with evaluate.mjs AND
// stress_warp.mjs before shipping: every point added buys a stretch of band
// that can be read against one more place an empty link can fire.
import { readFileSync, writeFileSync } from "fs";
import { LINK_MASKS } from "./linkMasks.mjs";
import {
  CANONICAL_SIZE as S,
  MIN_BAND_TILE_FRAC,
  bandCentreline,
  worstBandFrac,
} from "./classifier.mjs";

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node add_points.mjs <out.json> [max points per link]");
  process.exit(1);
}
const MAX_POINTS = Number(process.argv[3] || 6);
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
  const fixed = pts.length;
  if (mask) {
    // Candidates are the tile positions themselves: a point off its own route
    // reads the neighbouring link instead of this one. On whole px, because
    // that is what a point shipped as a 5-decimal normal reads back as, and a
    // rerun of this tool has to reproduce its own output.
    const candidates = bandCentreline(mask).map(([x, y]) => [Math.round(x), Math.round(y)]);
    let worst = worstBandFrac(mask, pts).frac;
    while (worst < MIN_BAND_TILE_FRAC && pts.length < MAX_POINTS) {
      // The candidate that lifts the band's weakest reading the most, rather
      // than one dropped on the weak spot: covering the worst place perfectly
      // is no help if it leaves the next-worst where it was.
      //
      // A stretch of route usually ties, and which end of it to take depends on
      // whether this point finishes the job. One that does takes the tie
      // nearest the points already placed, because it brings the least board
      // nothing was looking at into play: measured on birmingham-dudley, where
      // the near end of its tie answers empty board empty under a 12px warp and
      // the far end invents a white tile there. One that does not finish takes
      // the far end instead, to leave the point after it something to work
      // with - birmingham-worcester needs two, and off its near ties the second
      // one has nowhere left to go and the band stays under the floor.
      let best = null;
      for (const c of candidates) {
        const frac = worstBandFrac(mask, [...pts, c]).frac;
        const reach = Math.min(...pts.map((p) => Math.hypot(c[0] - p[0], c[1] - p[1])));
        if (
          !best ||
          frac > best.frac + 1e-9 ||
          (Math.abs(frac - best.frac) <= 1e-9 &&
            (frac >= MIN_BAND_TILE_FRAC ? reach < best.reach : reach > best.reach))
        )
          best = { frac, c, reach };
      }
      if (best.frac <= worst + 1e-9) break;
      pts.push(best.c);
      console.log(
        `${id} ${worst.toFixed(3)} -> ${best.frac.toFixed(3)} with ` +
          `${(best.c[0] / S).toFixed(5)},${(best.c[1] / S).toFixed(5)}`
      );
      worst = best.frac;
    }
    // Greedy overshoots. A point placed while the band was still well short can
    // turn out to buy nothing once a later one lands, and a point that buys
    // nothing is only one more place an empty link can fire, so drop any added
    // point the floor holds without. The hand-calibrated points are never
    // dropped: they are where tiles were actually observed.
    for (let i = pts.length - 1; i >= fixed; i--) {
      const without = pts.filter((_, k) => k !== i);
      if (worstBandFrac(mask, without).frac >= MIN_BAND_TILE_FRAC) {
        console.log(`${id} drops ${(pts[i][0] / S).toFixed(5)},${(pts[i][1] / S).toFixed(5)} again`);
        pts.splice(i, 1);
      }
    }
    worst = worstBandFrac(mask, pts).frac;
    if (worst < MIN_BAND_TILE_FRAC) {
      console.log(`${id} STILL reads ${worst.toFixed(3)} at ${pts.length} points`);
    }
  }
  const norm = pts.map((p) => [+(p[0] / S).toFixed(5), +(p[1] / S).toFixed(5)]);
  out[id] = norm.length > 1 ? norm : norm[0];
}
console.log(`\nsample points: ${count(base)} -> ${count(out)}`);
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
