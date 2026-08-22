// Render one QA image per traced mask: the printed board around each sample
// point, with the traced band, the calibrated sample point and the R=60 disc
// drawn on top. Used to check by eye that a mask actually follows the link's
// printed route.
//   node mask_overlay.mjs [outDir] [link_masks.json]
import { readFileSync, mkdirSync } from "fs";
import Jimp from "./node_modules/jimp/dist/index.js";
import { CANONICAL_SIZE as S, distToPoly, linkSamplePoints } from "./classifier.mjs";

const VIEW = 340;
const outDir = process.argv[2] || "./mask_qa";
const masks = JSON.parse(readFileSync(process.argv[3] || "./link_masks.json", "utf8"));
mkdirSync(outDir, { recursive: true });

const base = await Jimp.read("../../tmp/reference_base.jpg");
base.resize(S, S);

for (const [id, m] of Object.entries(masks)) {
  const pts = linkSamplePoints(id);
  const [nx, ny] = pts[0];
  const cx = Math.round(nx * S), cy = Math.round(ny * S);
  const v = base.clone().crop(cx - VIEW / 2, cy - VIEW / 2, VIEW, VIEW);
  const half = m.width / 2;
  // tint the traced band green
  for (let y = 0; y < VIEW; y++) for (let x = 0; x < VIEW; x++) {
    const wx = cx - VIEW / 2 + x, wy = cy - VIEW / 2 + y;
    const d = distToPoly(wx, wy, m.pts);
    if (d <= half) {
      const c = Jimp.intToRGBA(v.getPixelColor(x, y));
      v.setPixelColor(Jimp.rgbaToInt(
        Math.round(c.r * 0.45), Math.min(255, Math.round(c.g * 0.45 + 130)),
        Math.round(c.b * 0.45 + 40), 255), x, y);
    } else if (d <= half + 1.6) {
      v.setPixelColor(0x00ff88ff, x, y);
    }
  }
  // calibrated sample points in red, with the R=60 disc outline
  for (const [px, py] of pts) {
    const sx = Math.round(px * S) - (cx - VIEW / 2), sy = Math.round(py * S) - (cy - VIEW / 2);
    for (let d = -11; d <= 11; d++) { v.setPixelColor(0xff2020ff, sx + d, sy); v.setPixelColor(0xff2020ff, sx, sy + d); }
    for (let a = 0; a < 360; a += 0.5) {
      const x = Math.round(sx + 60 * Math.cos(a * Math.PI / 180));
      const y = Math.round(sy + 60 * Math.sin(a * Math.PI / 180));
      if (x >= 0 && y >= 0 && x < VIEW && y < VIEW) v.setPixelColor(0xff2020ff, x, y);
    }
  }
  await v.quality(92).writeAsync(`${outDir}/${id}.jpg`);
  console.log(`${outDir}/${id}.jpg`);
}
