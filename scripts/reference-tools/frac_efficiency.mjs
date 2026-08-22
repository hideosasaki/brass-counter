// How much of a tile's geometric best case does a real tile actually score?
// Compares each ground-truth tile's measured frac against the frac a tile-sized
// disc centred where that tile was detected would have given. The worst ratio
// here is what MIN_BAND_TILE_FRAC is derived from, so rerun this when
// ground-truth photos are added: a tile that reads worse than any yet seen
// lowers the floor the sample points have to clear.
import { readFileSync } from "fs";
import Jimp from "./node_modules/jimp/dist/index.js";
import { classifyAllLinks, setRefPatches } from "./pipeline.mjs";
import {
  CANONICAL_SIZE as S,
  DETECT_MIN_FRAC,
  detectedPoint,
  patchCellOffsets,
  patchRegion,
  samplePointsPx,
  tileFrac,
} from "./classifier.mjs";

setRefPatches(JSON.parse(readFileSync("../../public/scan/ref_patches.json", "utf8")));
const SETS = JSON.parse(readFileSync("./gt_sets.json", "utf8"));
const offsets = patchCellOffsets();
const ratios = [];
for (const [file, { side, era, allowed, truth }] of Object.entries(SETS)) {
  const img = await Jimp.read("../../tmp/" + file);
  for (const r of classifyAllLinks(img.bitmap, { era, allowed, side })) {
    if (!truth[r.linkId] || !r.centroid || r.frac < DETECT_MIN_FRAC) continue;
    const i = r.bestIndex || 0;
    const point = samplePointsPx(r.linkId)[i];
    const tile = detectedPoint(r.linkId, r).map((n) => n * S);
    const inRegion = patchRegion(r.linkId, i, [0, 0]);
    const ideal = tileFrac(offsets.filter(([ox, oy]) => inRegion(ox, oy)), point, tile);
    if (ideal) ratios.push({ id: r.linkId, file, obs: r.frac, ideal });
  }
}
ratios.sort((a, b) => a.obs / a.ideal - b.obs / b.ideal);
const rs = ratios.map((r) => r.obs / r.ideal);
const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
console.log(`observed frac / ideal frac over ${rs.length} real tiles:`);
console.log("  mean", mean.toFixed(2), " min", rs[0].toFixed(2), " 10th pct",
  rs[Math.floor(rs.length * 0.1)].toFixed(2), " max", rs[rs.length - 1].toFixed(2));
console.log("  weakest:", ratios.slice(0, 4).map((r) => `${r.id} ${(r.obs / r.ideal).toFixed(2)}`).join("  "));
