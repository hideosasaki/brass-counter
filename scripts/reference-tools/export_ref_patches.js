// Precompute the empty-board reference cell grids at every link sample point
// for both sides, shipped as public/scan/ref_patches.json.
// Keep CELL/PATCH_HALF in sync with src/scan/classifier.js.
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");
const coords = require("./coords.json");

const PATCH_HALF = 100;
const CELL = 8;

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

(async () => {
  const out = {};
  for (const side of ["day", "night"]) {
    const img = await Jimp.read(path.join(__dirname, "../../tmp/", `canonical_${side}.jpg`));
    const W = img.bitmap.width;
    out[side] = {};
    for (const [id, pos] of Object.entries(coords)) {
      const pts = Array.isArray(pos[0]) ? pos : [pos];
      out[side][id] = pts.map(([nx, ny]) =>
        cellGrid(img.bitmap, Math.round(nx * W), Math.round(ny * W))
      );
    }
  }
  const dest = path.join(__dirname, "../../public/scan/ref_patches.json");
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log("written", dest, (fs.statSync(dest).size / 1024).toFixed(0) + "KB");
})();
