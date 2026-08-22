// Full production-path evaluation on the ground-truth games.
// Canonical evaluation of the production classifier over the ground-truth
// games in ../../tmp/ (gitignored photos). Before running, copy the src
// modules next to this file with rewritten imports:
//   cp ../../src/linkPositions.js linkPositions.mjs
//   cp ../../src/boardData.js boardData.mjs
//   cp ../../src/linkMasks.js linkMasks.mjs
//   sed -e 's|from "../linkPositions"|from "./linkPositions.mjs"|' -e 's|from "../linkMasks"|from "./linkMasks.mjs"|' ../../src/scan/classifier.js > classifier.mjs
//   sed -e 's|from "../boardData"|from "./boardData.mjs"|' -e 's|from "./classifier"|from "./classifier.mjs"|' ../../src/scan/pipeline.js > pipeline.mjs
// Latest result (4 games, 156 positions): 152 auto-correct, 4 review, 0 wrong.
import { readFileSync } from "fs";
import {
  CANONICAL_SIZE,
  DETECT_MIN_FRAC,
  linkSamplePoints,
} from "./classifier.mjs";
import { classifyAllLinks, setRefPatches, CLOSE_PAIRS } from "./pipeline.mjs";
import Jimp from "./node_modules/jimp/dist/index.js";

setRefPatches(JSON.parse(readFileSync("../../public/scan/ref_patches.json", "utf8")));
console.log("close pairs:", JSON.stringify(CLOSE_PAIRS));

const SETS = JSON.parse(readFileSync("./gt_sets.json", "utf8"));

let okAuto = 0, review = 0, wrong = 0, total = 0;
for (const [file, { side, era, allowed, truth }] of Object.entries(SETS)) {
  const img = await Jimp.read("../../tmp/" + file);
  const links = classifyAllLinks(img.bitmap, { era, allowed, side });
  console.log("==", file);
  const byId = Object.fromEntries(links.map((r) => [r.linkId, r]));
  for (const [a, b] of CLOSE_PAIRS) {
    if (byId[a].frac >= DETECT_MIN_FRAC && byId[b].frac >= DETECT_MIN_FRAC) {
      const gc = (r) => {
        const [nx, ny] = linkSamplePoints(r.linkId)[r.bestIndex || 0];
        return [nx * CANONICAL_SIZE + r.centroid[0], ny * CANONICAL_SIZE + r.centroid[1]];
      };
      const [ax, ay] = gc(byId[a]), [bx, by] = gc(byId[b]);
      console.log("PAIR", a, "/", b, "centroid-sep", Math.hypot(ax - bx, ay - by).toFixed(0));
    }
  }
  for (const r of links) {
    const t = truth[r.linkId] || null;
    total++;
    if (r.state === "review") { review++; console.log("REVIEW", r.linkId, "truth", t, "guess", r.color, "frac", r.frac.toFixed(2)); }
    else if ((r.color || null) === t) okAuto++;
    else { wrong++; console.log("WRONG-AUTO", r.linkId, "truth", t, "got", r.color, "frac", r.frac.toFixed(2)); }
  }
}
console.log(`auto-correct: ${okAuto}/${total}, review: ${review}, WRONG-AUTO: ${wrong}`);
