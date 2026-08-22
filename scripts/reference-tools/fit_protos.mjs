// Re-centre the token color prototypes on the tiles actually observed. Prints
// the mean chroma of every color with enough ground-truth observations next to
// the shipped prototype, and a FIT line to paste into PROTOS in
// src/scan/classifier.js. Re-run after adding photos, then re-run evaluate.mjs.
//
// The per-scan chroma offset corrects a whole scan's tint; it cannot correct a
// prototype sitting off its own cluster, which costs margin against the
// neighbouring color and shows up as questions about tiles the scanner in fact
// identified correctly. Pink is where it bites first: pink and white are the
// closest pair on both board sides.
//
// Observations are corrected by that same per-scan offset before averaging, so
// the two mechanisms keep their meanings - tile color in PROTOS, this camera's
// tint in the offset. Averaging raw chroma instead bakes the corpus's shared
// tint into the prototypes, and then the offset measures nothing on the very
// photos it was fitted to.
import { readFileSync } from "fs";
import Jimp from "./node_modules/jimp/dist/index.js";
import { classifyAllLinks, setRefPatches } from "./pipeline.mjs";
import { PROTOS, estimateChromaOffset } from "./classifier.mjs";
setRefPatches(JSON.parse(readFileSync("../../public/scan/ref_patches.json", "utf8")));
const SETS = JSON.parse(readFileSync("./gt_sets.json", "utf8"));
const MIN_OBS = 8;

const obs = {};
for (const [file, { side, era, allowed, truth }] of Object.entries(SETS)) {
  const img = await Jimp.read("../../tmp/" + file);
  const links = classifyAllLinks(img.bitmap, { era, allowed, side });
  const [du, dv] = estimateChromaOffset(links, side);
  for (const r of links) {
    const t = truth[r.linkId];
    if (!t || !r.uv || !r.eraValid) continue;
    (obs[side + "/" + t] ||= []).push([r.uv[0] - du, r.uv[1] - dv]);
  }
  console.log(file.padEnd(20), "chroma offset", du.toFixed(4), dv.toFixed(4));
}

const fit = {};
console.log("");
for (const [key, uvs] of Object.entries(obs).sort()) {
  const [side, t] = key.split("/");
  const p = PROTOS[side][t];
  if (uvs.length < MIN_OBS) {
    console.log(key.padEnd(12), "n", String(uvs.length).padStart(3), "- too few, left alone");
    continue;
  }
  const u = +(uvs.reduce((a, v) => a + v[0], 0) / uvs.length).toFixed(4);
  const v = +(uvs.reduce((a, x) => a + x[1], 0) / uvs.length).toFixed(4);
  const rms = Math.sqrt(uvs.reduce((a, x) => a + (x[0] - u) ** 2 + (x[1] - v) ** 2, 0) / uvs.length);
  (fit[side] ||= {})[t] = [u, v];
  console.log(
    key.padEnd(12), "n", String(uvs.length).padStart(3),
    "proto", JSON.stringify(p), "-> observed", JSON.stringify([u, v]),
    "move", Math.hypot(u - p[0], v - p[1]).toFixed(4), "spread", rms.toFixed(4)
  );
}
console.log("\nFIT " + JSON.stringify(fit));
