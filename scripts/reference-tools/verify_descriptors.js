// Verify the exported .bin files: load them, match a game photo against
// both sides, and confirm side selection + inlier counts.
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");

function loadRef(cv, file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(0);
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push([buf.readFloatLE(4 + i * 8), buf.readFloatLE(4 + i * 8 + 4)]);
  }
  const desc = cv.matFromArray(n, 32, cv.CV_8U, Array.from(buf.subarray(4 + n * 8)));
  return { pts, desc, n };
}

(async () => {
  const cv = await require("@techstark/opencv-js");
  const orb = new cv.ORB(20000, 1.2, 12, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  const refs = {
    day: loadRef(cv, path.join(__dirname, "../../public/scan/ref_day.bin")),
    night: loadRef(cv, path.join(__dirname, "../../public/scan/ref_night.bin")),
  };
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  for (const photo of ["pic4310169.jpg", "pic4384467.jpg"]) {
    const img = await Jimp.read(path.join(__dirname, "../../tmp/", photo));
    img.scaleToFit(2000, 2000);
    const m = cv.matFromImageData({ data: img.bitmap.data, width: img.bitmap.width, height: img.bitmap.height });
    const g = new cv.Mat();
    cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
    const kp = new cv.KeyPointVector(), d = new cv.Mat();
    orb.detectAndCompute(g, new cv.Mat(), kp, d);
    for (const side of ["day", "night"]) {
      const knn = new cv.DMatchVectorVector();
      bf.knnMatch(d, refs[side].desc, knn, 2);
      const good = [];
      for (let i = 0; i < knn.size(); i++) {
        const p = knn.get(i);
        if (p.size() >= 2 && p.get(0).distance < 0.8 * p.get(1).distance) good.push(p.get(0));
      }
      if (good.length < 8) { console.log(photo, side, "good:", good.length); continue; }
      const srcPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
        good.flatMap((mm) => { const p = kp.get(mm.queryIdx).pt; return [p.x, p.y]; }));
      const dstPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
        good.flatMap((mm) => refs[side].pts[mm.trainIdx]));
      const mask = new cv.Mat();
      cv.findHomography(srcPts, dstPts, cv.USAC_MAGSAC, 4.0, mask);
      let inl = 0;
      for (let i = 0; i < mask.rows; i++) inl += mask.data[i];
      console.log(photo, side, "good:", good.length, "inliers:", inl);
    }
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
