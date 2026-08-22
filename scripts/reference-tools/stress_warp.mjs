// False-positive stress test, no photo needed: take the empty-board reference
// itself as the input, push it through a smooth displacement field that a
// single translation cannot undo (what a folded board leaves behind after the
// homography), and see which links report a tile on board that is provably
// empty. Every link should come back empty; anything that fires is a mask, a
// sample point or a threshold that cannot survive a real photo.
//
//   node stress_warp.mjs [amplitude px] [wavelength px]
//
// 4 and 8px at 400px are around what real photos leave; 12 is past it, and
// firing there is not by itself a defect.
import { readFileSync } from "fs";
import Jimp from "./node_modules/jimp/dist/index.js";
import { classifyAllLinks, setRefPatches } from "./pipeline.mjs";
import { DETECT_MIN_FRAC } from "./classifier.mjs";
setRefPatches(JSON.parse(readFileSync("../../public/scan/ref_patches.json", "utf8")));

const AMP = Number(process.argv[2] || 8);
const WAVE = Number(process.argv[3] || 400);
const src = await Jimp.read("../../tmp/canonical_day.jpg");
const { width: W, height: H, data: S } = src.bitmap;
const out = src.clone();
const D = out.bitmap.data;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const sx = Math.min(W - 1, Math.max(0, Math.round(x + AMP * Math.sin((2 * Math.PI * y) / WAVE))));
    const sy = Math.min(H - 1, Math.max(0, Math.round(y + AMP * Math.sin((2 * Math.PI * x) / WAVE))));
    const di = (y * W + x) * 4, si = (sy * W + sx) * 4;
    D[di] = S[si]; D[di + 1] = S[si + 1]; D[di + 2] = S[si + 2]; D[di + 3] = 255;
  }
}
const links = classifyAllLinks(out.bitmap, {
  era: "canal", allowed: ["yellow", "red", "pink", "white"], side: "day",
});
const valid = links.filter((l) => l.eraValid);
const hits = valid
  .filter((l) => l.frac >= DETECT_MIN_FRAC)
  .sort((a, b) => b.frac - a.frac);
const bad = hits.filter((l) => l.color || l.state === "review");
console.log(`amp ${AMP}px wave ${WAVE}px: ${hits.length} of ${valid.length} era-valid links register anything, ${bad.length} of those are not answered empty`);
for (const h of hits)
  console.log("  ", h.linkId.padEnd(30), "frac", h.frac.toFixed(3),
    "lift", h.lift.toFixed(1).padStart(6), "color", String(h.color).padEnd(6), h.state);
