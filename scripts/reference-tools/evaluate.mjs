// Full production-path evaluation on the ground-truth games.
// Canonical evaluation of the production classifier over the ground-truth
// games in ../../tmp/ (gitignored photos). Before running, copy the src
// modules next to this file with rewritten imports:
//   cp ../../src/linkPositions.js linkPositions.mjs
//   cp ../../src/boardData.js boardData.mjs
//   cp ../../src/linkMasks.js linkMasks.mjs
//   sed -e 's|from "../linkPositions"|from "./linkPositions.mjs"|' -e 's|from "../linkMasks"|from "./linkMasks.mjs"|' ../../src/scan/classifier.js > classifier.mjs
//   sed -e 's|from "../boardData"|from "./boardData.mjs"|' -e 's|from "./classifier"|from "./classifier.mjs"|' ../../src/scan/pipeline.js > pipeline.mjs
// Latest result (312 positions): 292 auto-correct, 20 review, 0 wrong. The
// color prototypes are fitted to these same photos (fit_protos.mjs), so read
// the color part of that score as self-consistent rather than as held out.
// Eight photos of six board states. Eighteen of the 20 questions come from the
// two shot under indoor light, where the light pulls the palette in toward
// neutral and a thin margin is all that is left of most readings. The other two
// are on daylit photos and were there before that: a yellow tile too faint to
// name, and print showing through a link no tile is on.
//
// Of the eight: app_0682.jpg is the app's own warp of the
// same board as warped_0682.jpg, kept in the set because the scanner's
// residual misalignment there is what a self-warped photo cannot reproduce,
// and warped_0682.jpg shows none of it. Counting both inflates the position
// total, so treat 234 as coverage, not as independent evidence.
//
// warped_0684.jpg is a board with every rail-era link occupied, which is where
// the untested links finally got a tile on them. Its truth is the app's own
// reading with the one link it got wrong corrected, and three spot-checked
// against the photo by eye, so it is stronger evidence for detection (was a
// tile seen at all) than for color.
import { readFileSync } from "fs";
import { classifyAllLinks, setRefPatches } from "./pipeline.mjs";
import Jimp from "./node_modules/jimp/dist/index.js";

setRefPatches(JSON.parse(readFileSync("../../public/scan/ref_patches.json", "utf8")));

const SETS = JSON.parse(readFileSync("./gt_sets.json", "utf8"));

let okAuto = 0, review = 0, wrong = 0, total = 0;
for (const [file, { side, era, allowed, truth }] of Object.entries(SETS)) {
  const img = await Jimp.read("../../tmp/" + file);
  const links = classifyAllLinks(img.bitmap, { era, allowed, side });
  console.log("==", file);
  for (const r of links) {
    const t = truth[r.linkId] || null;
    total++;
    if (r.state === "review") { review++; console.log("REVIEW", r.linkId, "truth", t, "guess", r.color, "frac", r.frac.toFixed(2)); }
    else if ((r.color || null) === t) okAuto++;
    else { wrong++; console.log("WRONG-AUTO", r.linkId, "truth", t, "got", r.color, "frac", r.frac.toFixed(2)); }
  }
}
console.log(`auto-correct: ${okAuto}/${total}, review: ${review}, WRONG-AUTO: ${wrong}`);
