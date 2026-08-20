const Jimp = require("jimp");
const path = require("path");
const coords = require("./coords.json");
const IDS = ["stokeOnTrent-warrington", "coventry-nuneaton"];
const FILES = ["canonical_day.jpg", "warped_canal.jpg", "canonical_night.jpg", "warped_rail.jpg"];
const P = 170;
(async () => {
  const font = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
  const canvas = new Jimp(FILES.length * (2 * P + 10) + 10, IDS.length * (2 * P + 26) + 10, 0xf0f0f0ff);
  for (let col = 0; col < FILES.length; col++) {
    const img = await Jimp.read(path.join(__dirname, "../../tmp/", FILES[col]));
    const W = img.bitmap.width;
    for (let row = 0; row < IDS.length; row++) {
      const pos = coords[IDS[row]]; const [nx, ny] = Array.isArray(pos[0]) ? pos[0] : pos;
      const cx = Math.round(nx * W), cy = Math.round(ny * W);
      const patch = img.clone().crop(cx - P, cy - P, 2 * P, 2 * P);
      for (let d = -60; d <= 60; d++) {
        patch.setPixelColor(0xff0000ff, P + d, P);
        patch.setPixelColor(0xff0000ff, P, P + d);
      }
      canvas.composite(patch, 10 + col * (2 * P + 10), 26 + row * (2 * P + 26));
      if (col === 0) canvas.print(font, 10, 8 + row * (2 * P + 26), IDS[row]);
    }
  }
  await canvas.quality(88).writeAsync("debug_patches.jpg");
  console.log("saved (cols: canonical_day, warped_canal, canonical_night, warped_rail)");
})();
