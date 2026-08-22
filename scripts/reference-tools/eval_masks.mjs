// Score the link masks against the plain disc they replaced, on the
// ground-truth games.
//
//   node eval_masks.mjs                 # shipped masks vs the old disc
//   node eval_masks.mjs --width x1.3    # same, with every band scaled
//   node eval_masks.mjs other.json      # a candidate link_masks.json
//
// Both runs go through the production classifyAllLinks; only the decision
// region differs. Nothing here re-implements the classifier, so a number
// printed by this harness is a number production would produce.
import { readFileSync } from "fs";
import {
  CANONICAL_SIZE, DISC_REGION, distToPoly, linkSamplePoints, patchRegion,
} from "./classifier.mjs";
import { classifyAllLinks, setRefPatches } from "./pipeline.mjs";
import { LINK_MASKS } from "./linkMasks.mjs";
import Jimp from "./node_modules/jimp/dist/index.js";

setRefPatches(JSON.parse(readFileSync("../../public/scan/ref_patches.json", "utf8")));

const args = process.argv.slice(2);
const widthArg = args.indexOf("--width");
const widthScale = widthArg >= 0 ? parseFloat(args[widthArg + 1].replace(/^x/, "")) : 1;
const maskFile = args.find((a) => a.endsWith(".json"));

const SETS = JSON.parse(readFileSync("./gt_sets.json", "utf8"));
const discFor = () => DISC_REGION;

// Region policy for a candidate mask set, mirroring patchRegion. Only needed
// when this run is not scoring the shipped masks as they stand.
function regionForMasks(masks) {
  return (linkId, sampleIndex, shift) => {
    const mask = masks[linkId];
    if (!mask) return DISC_REGION;
    const [nx, ny] = linkSamplePoints(linkId)[sampleIndex];
    const cx = Math.round(nx * CANONICAL_SIZE) + shift[0];
    const cy = Math.round(ny * CANONICAL_SIZE) + shift[1];
    const half = (mask.width * widthScale) / 2;
    return (px, py) => distToPoly(cx + px, cy + py, mask.pts) <= half;
  };
}

const shippedAsIs = !maskFile && widthScale === 1;
const maskRegion = shippedAsIs
  ? patchRegion
  : regionForMasks(maskFile ? JSON.parse(readFileSync(maskFile, "utf8")) : LINK_MASKS);

async function run(regionFor, label) {
  let ok = 0, review = 0, wrong = 0, total = 0;
  const detail = [];
  for (const [file, { side, era, allowed, truth }] of Object.entries(SETS)) {
    const img = await Jimp.read("../../tmp/" + file);
    for (const r of classifyAllLinks(img.bitmap, { era, allowed, side, regionFor })) {
      const t = truth[r.linkId] || null;
      total++;
      if (r.state === "review") { review++; detail.push(`  REVIEW ${file} ${r.linkId} truth=${t} guess=${r.color} frac=${r.frac.toFixed(2)}`); }
      else if ((r.color || null) === t) ok++;
      else { wrong++; detail.push(`  WRONG  ${file} ${r.linkId} truth=${t} got=${r.color} frac=${r.frac.toFixed(2)}`); }
    }
  }
  console.log(`\n${label}: auto-correct ${ok}/${total}, review ${review}, WRONG ${wrong}`);
  for (const d of detail) console.log(d);
  return { ok, review, wrong };
}

console.log(`masks: ${maskFile || "src/linkMasks.js"}${widthScale === 1 ? "" : `, widths x${widthScale}`}`);
// The disc column swaps the decision region back, but the crosstalk pass that
// used to sit behind it is gone, so this is not a rerun of the previous
// release: its wrong answers are ones that pass used to catch. Read it as the
// region change on its own, which is what it is here to measure.
const disc = await run(discFor, "disc R=60 (region change only, not the old build)");
const masked = await run(maskRegion, "polyline masks");
const d = (a, b) => (b - a >= 0 ? "+" : "") + (b - a);
console.log(`\ndelta: auto ${d(disc.ok, masked.ok)}, review ${d(disc.review, masked.review)}, wrong ${d(disc.wrong, masked.wrong)}`);
if (masked.wrong > disc.wrong) console.log("the masks introduced silent errors: not an improvement");
