// Precompute ORB keypoints + descriptors for the canonical day/night
// references and write them as binary assets for the app.
// Format: [uint32 n][n * 2 float32 (x,y in canonical 2048 px)][n * 32 uint8 descriptors]
// Run: node export_descriptors.js
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");

const TMP = path.join(__dirname, "../../tmp/");
const OUT = path.join(__dirname, "../../public/scan/");

(async () => {
  const cv = await require("@techstark/opencv-js");
  const orb = new cv.ORB(20000, 1.2, 12, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  fs.mkdirSync(OUT, { recursive: true });
  for (const side of ["day", "night"]) {
    const img = await Jimp.read(TMP + `canonical_${side}.jpg`);
    const m = cv.matFromImageData({ data: img.bitmap.data, width: img.bitmap.width, height: img.bitmap.height });
    const g = new cv.Mat();
    cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
    const kp = new cv.KeyPointVector(), d = new cv.Mat();
    orb.detectAndCompute(g, new cv.Mat(), kp, d);
    const n = kp.size();
    if (d.cols !== 32) throw new Error("unexpected descriptor width " + d.cols);
    const buf = Buffer.alloc(4 + n * 8 + n * 32);
    buf.writeUInt32LE(n, 0);
    for (let i = 0; i < n; i++) {
      const p = kp.get(i).pt;
      buf.writeFloatLE(p.x, 4 + i * 8);
      buf.writeFloatLE(p.y, 4 + i * 8 + 4);
    }
    Buffer.from(d.data).copy(buf, 4 + n * 8);
    fs.writeFileSync(OUT + `ref_${side}.bin`, buf);
    console.log(side, "keypoints:", n, "bytes:", buf.length);
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
