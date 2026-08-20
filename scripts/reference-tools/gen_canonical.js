// Warp the day/night reference photos into the render's distortion-free
// square frame, producing canonical references at 2048x2048.
const Jimp = require("jimp");

async function load(path, maxDim) {
  const img = await Jimp.read(path);
  if (Math.max(img.bitmap.width, img.bitmap.height) > maxDim) img.scaleToFit(maxDim, maxDim);
  return img;
}

(async () => {
  const cv = await require("@techstark/opencv-js");
  const orb = new cv.ORB(20000, 1.2, 12, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  const TMP = "/Users/sasaki/Documents/brass-counter/tmp/";
  const OUT = 2048;

  const renderJ = await load(TMP + "reference_base.jpg", 2000);
  const toGray = (j) => {
    const m = cv.matFromImageData({ data: j.bitmap.data, width: j.bitmap.width, height: j.bitmap.height });
    const g = new cv.Mat();
    cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
    m.delete();
    return g;
  };
  const detect = (g) => {
    const k = new cv.KeyPointVector(), d = new cv.Mat();
    orb.detectAndCompute(g, new cv.Mat(), k, d);
    return { k, d };
  };
  const renderG = toGray(renderJ);
  const renderF = detect(renderG);
  const s = OUT / renderJ.bitmap.width;
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);

  for (const name of ["day", "night"]) {
    const photoJ = await load(TMP + `reference_${name}.jpg`, 3000);
    const photoF = detect(toGray(photoJ));
    const knn = new cv.DMatchVectorVector();
    bf.knnMatch(photoF.d, renderF.d, knn, 2);
    const good = [];
    for (let i = 0; i < knn.size(); i++) {
      const p = knn.get(i);
      if (p.size() >= 2 && p.get(0).distance < 0.8 * p.get(1).distance) good.push(p.get(0));
    }
    const srcPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
      good.flatMap((m) => { const p = photoF.k.get(m.queryIdx).pt; return [p.x, p.y]; }));
    const dstPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
      good.flatMap((m) => { const p = renderF.k.get(m.trainIdx).pt; return [p.x * s, p.y * s]; }));
    const mask = new cv.Mat();
    const H = cv.findHomography(srcPts, dstPts, cv.USAC_MAGSAC, 4.0, mask);
    let inl = 0;
    for (let i = 0; i < mask.rows; i++) inl += mask.data[i];
    console.log(name, "matches:", good.length, "inliers:", inl);

    const color = cv.matFromImageData({ data: photoJ.bitmap.data, width: photoJ.bitmap.width, height: photoJ.bitmap.height });
    const out = new cv.Mat();
    cv.warpPerspective(color, out, H, new cv.Size(OUT, OUT));
    const outImg = new Jimp(out.cols, out.rows);
    outImg.bitmap.data = Buffer.from(out.data);
    await outImg.quality(92).writeAsync(TMP + `canonical_${name}.jpg`);
    console.log(`saved canonical_${name}.jpg`);
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
