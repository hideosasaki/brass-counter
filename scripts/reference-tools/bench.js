const Jimp = require("jimp");
const fs = require("fs");

async function gray(cv, path, maxDim) {
  const img = await Jimp.read(path);
  if (Math.max(img.bitmap.width, img.bitmap.height) > maxDim) img.scaleToFit(maxDim, maxDim);
  const m = cv.matFromImageData({ data: img.bitmap.data, width: img.bitmap.width, height: img.bitmap.height });
  const g = new cv.Mat();
  cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
  m.delete();
  return g;
}

(async () => {
  const cv = await require("@techstark/opencv-js");
  const orb = new cv.ORB(20000, 1.2, 12, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  const detect = (g) => {
    const k = new cv.KeyPointVector(), d = new cv.Mat();
    orb.detectAndCompute(g, new cv.Mat(), k, d);
    return { k, d };
  };
  const TMP = "/Users/sasaki/Documents/brass-counter/tmp/";
  const refs = {};
  for (const r of ["reference_day.jpg", "reference_night.jpg", "reference_base.jpg"]) {
    refs[r] = detect(await gray(cv, TMP + r, 2000));
  }
  const photos = fs.readdirSync(TMP).filter((f) => f.startsWith("pic"));
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);

  const inliersFor = (a, b) => {
    const knn = new cv.DMatchVectorVector();
    bf.knnMatch(a.d, b.d, knn, 2);
    const good = [];
    for (let i = 0; i < knn.size(); i++) {
      const p = knn.get(i);
      if (p.size() >= 2 && p.get(0).distance < 0.8 * p.get(1).distance) good.push(p.get(0));
    }
    if (good.length < 8) return { good: good.length, inl: 0 };
    const srcPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
      good.flatMap((m) => { const p = a.k.get(m.queryIdx).pt; return [p.x, p.y]; }));
    const dstPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
      good.flatMap((m) => { const p = b.k.get(m.trainIdx).pt; return [p.x, p.y]; }));
    const mask = new cv.Mat();
    cv.findHomography(srcPts, dstPts, cv.USAC_MAGSAC, 4.0, mask);
    let inl = 0;
    for (let i = 0; i < mask.rows; i++) inl += mask.data[i];
    return { good: good.length, inl };
  };

  console.log("photo, vs_day(matches/inliers), vs_night, vs_render");
  for (const p of photos) {
    const ph = detect(await gray(cv, TMP + p, 2000));
    const row = [p];
    for (const r of ["reference_day.jpg", "reference_night.jpg", "reference_base.jpg"]) {
      const { good, inl } = inliersFor(ph, refs[r]);
      row.push(`${good}/${inl}`);
    }
    console.log(row.join(", "));
    ph.k.delete(); ph.d.delete();
  }
  // day/night refs vs the clean render (for canonical-frame bootstrapping)
  const dn = inliersFor(refs["reference_day.jpg"], refs["reference_base.jpg"]);
  const nn = inliersFor(refs["reference_night.jpg"], refs["reference_base.jpg"]);
  console.log("day_ref vs render:", `${dn.good}/${dn.inl}`, "| night_ref vs render:", `${nn.good}/${nn.inl}`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
