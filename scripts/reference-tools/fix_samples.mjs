// Move a link's calibrated sample point onto the centre of its traced band and
// rebuild that link's reference patches, writing sample_overrides.json for
// eval_masks.mjs to try before anything ships.
//
//   node fix_samples.mjs cannock-stafford nuneaton-tamworth
//
// A patch is only meaningful where the printed route actually is: these links
// were calibrated onto blank ground, so the disc never saw their own route.
// The cell grid below is export_ref_patches.js's, not the classifier's: the
// shipped patches are rounded to integers on the way into JSON, and a patch
// rebuilt from the classifier's float version would not sit alongside them.
import { readFileSync, writeFileSync } from "fs";
import Jimp from "./node_modules/jimp/dist/index.js";
import { linkSamplePoints } from "./classifier.mjs";

const S = 2048, PATCH_HALF = 100, CELL = 8;
const masks = JSON.parse(readFileSync("./link_masks.json", "utf8"));
const ids = process.argv.slice(2);
if (!ids.length) { console.error("usage: node fix_samples.mjs <linkId>..."); process.exit(1); }

// midpoint of the traced polyline by arc length, in normalized board coords
function bandCentre(pts) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d); total += d;
  }
  let want = total / 2;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? want / seg[i] : 0;
      return [
        +(pts[i][0] + t * (pts[i + 1][0] - pts[i][0])).toFixed(5),
        +(pts[i][1] + t * (pts[i + 1][1] - pts[i][1])).toFixed(5),
      ];
    }
    want -= seg[i];
  }
}

function cellGrid(bitmap, cx, cy) {
  const { data, width, height } = bitmap;
  const n = (2 * PATCH_HALF) / CELL;
  const cells = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    let r = 0, g = 0, b = 0, k = 0;
    for (let dy = 0; dy < CELL; dy += 2) for (let dx = 0; dx < CELL; dx += 2) {
      const x = cx - PATCH_HALF + gx * CELL + dx;
      const y = cy - PATCH_HALF + gy * CELL + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; k++;
    }
    cells.push(k ? [Math.round(r / k), Math.round(g / k), Math.round(b / k)] : [0, 0, 0]);
  }
  return cells;
}

const imgs = {
  day: await Jimp.read("../../tmp/canonical_day.jpg"),
  night: await Jimp.read("../../tmp/canonical_night.jpg"),
};

const out = {};
for (const id of ids) {
  if (!masks[id]) { console.error(`no mask traced for ${id}`); process.exit(1); }
  const centre = bandCentre(masks[id].pts);
  const old = linkSamplePoints(id);
  const moved = Math.hypot(centre[0] - old[0][0], centre[1] - old[0][1]) * S;
  out[id] = {
    pts: [centre],
    patches: {
      day: [cellGrid(imgs.day.bitmap, Math.round(centre[0] * S), Math.round(centre[1] * S))],
      night: [cellGrid(imgs.night.bitmap, Math.round(centre[0] * S), Math.round(centre[1] * S))],
    },
  };
  console.log(`${id}: [${old[0]}] -> [${centre}]  (${moved.toFixed(0)}px)`);
}
writeFileSync("./sample_overrides.json", JSON.stringify(out));
console.log(`written sample_overrides.json (${ids.length} links)`);
