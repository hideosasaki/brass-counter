// Full production-path evaluation on the ground-truth games.
// Canonical evaluation of the production classifier over the ground-truth
// games in ../../tmp/ (gitignored photos). Before running, copy the src
// modules next to this file with rewritten imports:
//   cp ../../src/linkPositions.js linkPositions.mjs
//   cp ../../src/boardData.js boardData.mjs
//   cp ../../src/linkMasks.js linkMasks.mjs
//   sed -e 's|from "../linkPositions"|from "./linkPositions.mjs"|' -e 's|from "../linkMasks"|from "./linkMasks.mjs"|' ../../src/scan/classifier.js > classifier.mjs
//   sed -e 's|from "../boardData"|from "./boardData.mjs"|' -e 's|from "./classifier"|from "./classifier.mjs"|' ../../src/scan/pipeline.js > pipeline.mjs
// Latest result: of the 262 positions the scanner decides, 246 auto-correct,
// 16 review, 0 wrong; the other 50 are links their era does not have, which
// are answered empty by rule and so are counted apart rather than credited.
// The color prototypes are fitted to these same photos (fit_protos.mjs), so
// read the color part of that score as self-consistent rather than as held
// out. Eight photos of six board states. Fifteen of the 16 questions come from
// the two shot under indoor light, where the light pulls the palette in toward
// neutral and a thin margin is all that is left of most readings. The one on a
// daylit photo was there before that: print showing through coventry-nuneaton,
// which no tile is on.
//
// The truth sets list only links that were actually built, so a link its era
// does not have is always absent from them, and the run says so out loud if
// one is not. Three entries used to break that: markers a player had parked on
// closed links so nobody would build there, and one tile placed on a rail-only
// link to test detection from a canal-era photo.
//
// Of the eight: app_0682.jpg is the app's own warp of the
// same board as warped_0682.jpg, kept in the set because the scanner's
// residual misalignment there is what a self-warped photo cannot reproduce,
// and warped_0682.jpg shows none of it. Counting both inflates the position
// total, so read one photo's worth of it as duplicated coverage rather than as
// independent evidence.
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

let okAuto = 0, review = 0, wrong = 0, total = 0, eraClosed = 0;
for (const [file, { side, era, allowed, truth }] of Object.entries(SETS)) {
  const img = await Jimp.read("../../tmp/" + file);
  const links = classifyAllLinks(img.bitmap, { era, allowed, side });
  console.log("==", file);
  for (const r of links) {
    const t = truth[r.linkId] || null;
    // A link this era does not have is answered empty by rule, so counting it
    // as a correct answer would credit the scanner for a position it never
    // read. Its own line instead, and a shout if the truth set records a tile
    // on one: either the annotation is wrong or the era table is.
    if (!r.eraValid) {
      eraClosed++;
      if (t) console.log("ERA-CLOSED BUT TRUTH", r.linkId, t);
      continue;
    }
    total++;
    if (r.state === "review") { review++; console.log("REVIEW", r.linkId, "truth", t, "guess", r.color, "frac", r.frac.toFixed(2)); }
    else if ((r.color || null) === t) okAuto++;
    else { wrong++; console.log("WRONG-AUTO", r.linkId, "truth", t, "got", r.color, "frac", r.frac.toFixed(2)); }
  }
}
console.log(
  `auto-correct: ${okAuto}/${total}, review: ${review}, WRONG-AUTO: ${wrong}` +
    ` (+${eraClosed} era-closed positions, answered empty by rule)`
);
