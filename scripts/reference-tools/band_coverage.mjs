// How much of each link's traced band its sample points actually let the
// scanner score. Band area no patch reaches is never looked at, so a tile there
// cannot be seen; src/linkMasks.test.js fails when a gap gets big enough to
// hide one, and this says where the slack is before it gets that far.
import { LINK_MASKS } from "./linkMasks.mjs";
import {
  CANONICAL_SIZE as S,
  MAX_UNSCORED_BAND_CELLS,
  bandCells,
  linkSamplePoints,
  unscoredCells,
} from "./classifier.mjs";

const rows = Object.entries(LINK_MASKS).map(([id, mask]) => {
  const points = linkSamplePoints(id).map(([nx, ny]) => [nx * S, ny * S]);
  const cells = bandCells(mask);
  const unscored = unscoredCells(cells, points).length;
  return { id, points: points.length, total: cells.length, unscored };
});
rows.sort((a, b) => b.unscored - a.unscored);
console.log(`unscored cells (the shipped bound is ${MAX_UNSCORED_BAND_CELLS})`);
console.log("unscored  of band  points  link");
for (const r of rows) {
  console.log(
    String(r.unscored).padStart(8),
    String(r.total).padStart(8),
    String(r.points).padStart(7),
    " ",
    r.id
  );
}
