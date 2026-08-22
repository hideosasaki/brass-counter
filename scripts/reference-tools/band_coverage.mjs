// The weakest reading each link's sample points give a tile on its band, and
// where on the route that is. src/linkMasks.test.js fails once a band drops
// below MIN_BAND_TILE_FRAC; this shows how much room each one has before it
// gets there, and which end of a route is the thin one.
import { LINK_MASKS } from "./linkMasks.mjs";
import {
  CANONICAL_SIZE as S,
  MIN_BAND_TILE_FRAC,
  samplePointsPx,
  worstBandFrac,
} from "./classifier.mjs";

const rows = Object.entries(LINK_MASKS).map(([id, mask]) => {
  const points = samplePointsPx(id);
  return { id, points: points.length, ...worstBandFrac(mask, points) };
});
rows.sort((a, b) => a.frac - b.frac);
console.log(`worst frac a tile on the band would be read at (the floor is ${MIN_BAND_TILE_FRAC})`);
console.log(" frac  points  weakest at        link");
for (const r of rows) {
  const at = r.at ? `${(r.at[0] / S).toFixed(3)},${(r.at[1] / S).toFixed(3)}` : "-";
  console.log(
    r.frac.toFixed(3).padStart(5),
    String(r.points).padStart(7),
    " ",
    at.padEnd(16),
    r.id
  );
}
