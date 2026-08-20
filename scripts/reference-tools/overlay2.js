const Jimp = require("jimp");
const coords = require("./coords.json");
(async () => {
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  for (const f of ["warped_rail.jpg", "warped_canal.jpg"]) {
    const img = await Jimp.read(f);
    const W = img.bitmap.width;
    let i = 1;
    for (const [id, [nx, ny]] of Object.entries(coords)) {
      const x = Math.round(nx * W), y = Math.round(ny * W);
      for (let dx = -40; dx <= 40; dx++) for (const dy of [-40, 40]) {
        img.setPixelColor(0xff0000ff, x + dx, y + dy);
        img.setPixelColor(0xff0000ff, x + dy, y + dx);
      }
      img.print(font, x - 18, y - 14, String(i));
      i++;
    }
    await img.quality(88).writeAsync("ov_" + f);
  }
  console.log("done");
})();
