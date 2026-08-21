// Full production-path evaluation on all three ground-truth games.
// Canonical evaluation of the production classifier over the ground-truth
// games in ../../tmp/ (gitignored photos). Before running, copy the src
// modules next to this file with rewritten imports:
//   sed 's|from "../linkPositions"|from "./linkPositions.mjs"|' ../../src/scan/classifier.js > classifier.mjs
//   sed -e 's|from "../boardData"|from "./boardData.mjs"|' -e 's|from "./classifier"|from "./classifier.mjs"|' ../../src/scan/pipeline.js > pipeline.mjs
//   cp ../../src/linkPositions.js linkPositions.mjs && cp ../../src/boardData.js boardData.mjs
// Latest result (3 games, 117 positions): 108 auto-correct, 9 review, 0 wrong.
import { readFileSync } from "fs";
import { CANONICAL_SIZE } from "./classifier.mjs";
import { classifyAllLinks, setRefPatches, CLOSE_PAIRS } from "./pipeline.mjs";
import { linkSamplePoints } from "./classifier.mjs";
import Jimp from "./node_modules/jimp/dist/index.js";

setRefPatches(JSON.parse(readFileSync("../../public/scan/ref_patches.json", "utf8")));
console.log("close pairs:", JSON.stringify(CLOSE_PAIRS));

const SETS = {
  "warped_canal.jpg": { side: "day", era: "canal", allowed: ["pink", "red", "yellow"], truth: {
    "coalbrookdale-shrewsbury":"pink","coalbrookdale-wolverhampton":"red","dudley-wolverhampton":"red",
    "coalbrookdale-kidderminster":"pink","kidderminster-worcester":"pink","birmingham-dudley":"red",
    "birmingham-worcester":"pink","birmingham-walsall":"pink","birmingham-oxford":"yellow",
    "birmingham-coventry":"yellow","redditch-oxford":"yellow","birmingham-tamworth":"yellow",
    "burtonOnTrent-tamworth":"yellow","leek-stokeOnTrent":"red" } },
  "warped_rail.jpg": { side: "night", era: "rail", allowed: ["pink", "white", "yellow"], truth: {
    "derby-uttoxeter":"white","stone-uttoxeter":"white","stafford-stone":"white","coalbrookdale-shrewsbury":"white",
    "coalbrookdale-wolverhampton":"white","walsall-wolverhampton":"white","birmingham-walsall":"white",
    "birmingham-dudley":"white","birmingham-coventry":"white","birmingham-oxford":"white",
    "burtonOnTrent-stone":"pink","burtonOnTrent-derby":"pink","burtonOnTrent-cannock":"pink",
    "burtonOnTrent-tamworth":"pink","nuneaton-tamworth":"pink","tamworth-walsall":"pink",
    "birmingham-tamworth":"pink","birmingham-nuneaton":"pink","coalbrookdale-kidderminster":"pink",
    "kidderminster-worcester":"pink","gloucester-worcester":"pink","birmingham-worcester":"pink",
    "dudley-wolverhampton":"yellow","dudley-kidderminster":"yellow","birmingham-redditch":"yellow",
    "gloucester-redditch":"yellow" } },
  "warped_test.jpg": { side: "day", era: "canal", allowed: ["red", "yellow"], truth: {
    "coalbrookdale-shrewsbury":"red","coalbrookdale-wolverhampton":"red","dudley-wolverhampton":"red",
    "birmingham-coventry":"yellow","birmingham-dudley":"yellow","birmingham-oxford":"yellow",
    "birmingham-nuneaton":"yellow" } },
  // Strong glare over the Derby area plus a boat between the belper-derby and
  // derby-nottingham sample points; the original classifier double-counted it.
  "warped_0682.jpg": { side: "day", era: "canal", allowed: ["yellow", "red", "pink", "white"], truth: {
    "coalbrookdale-shrewsbury":"red","coalbrookdale-wolverhampton":"red","dudley-wolverhampton":"red",
    "stafford-stone":"pink","derby-nottingham":"white","birmingham-coventry":"yellow",
    "birmingham-dudley":"yellow","birmingham-oxford":"yellow","birmingham-tamworth":"yellow" } },
};

let okAuto = 0, review = 0, wrong = 0, total = 0;
for (const [file, { side, era, allowed, truth }] of Object.entries(SETS)) {
  const img = await Jimp.read("../../tmp/" + file);
  const links = classifyAllLinks(img.bitmap, { era, allowed, side });
  console.log("==", file);
  const byId = Object.fromEntries(links.map((r) => [r.linkId, r]));
  for (const [a, b] of CLOSE_PAIRS) {
    if (byId[a].frac >= 0.12 && byId[b].frac >= 0.12) {
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
