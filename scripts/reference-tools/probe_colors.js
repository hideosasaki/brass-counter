// Probe actual token colors: for each ground-truth link, report the dominant
// saturated color cluster in its patch (canonical frame).
const Jimp = require("jimp");
const path = require("path");
const coords = require("./coords.json");

const GT = {
  "warped_canal.jpg": {
    "coalbrookdale-shrewsbury": "pink", "coalbrookdale-wolverhampton": "red",
    "dudley-wolverhampton": "red", "coalbrookdale-kidderminster": "pink",
    "kidderminster-worcester": "pink", "birmingham-dudley": "red",
    "birmingham-worcester": "pink", "birmingham-walsall": "pink",
    "birmingham-oxford": "yellow", "birmingham-coventry": "yellow",
    "redditch-oxford": "yellow", "birmingham-tamworth": "yellow",
    "burtonOnTrent-tamworth": "yellow", "leek-stokeOnTrent": "red"
  },
  "warped_rail.jpg": {
    "derby-uttoxeter": "white", "stone-uttoxeter": "white", "stafford-stone": "white",
    "coalbrookdale-shrewsbury": "white", "coalbrookdale-wolverhampton": "white",
    "walsall-wolverhampton": "white", "birmingham-walsall": "white",
    "birmingham-dudley": "white", "birmingham-coventry": "white", "birmingham-oxford": "white",
    "burtonOnTrent-stone": "pink", "burtonOnTrent-derby": "pink", "burtonOnTrent-cannock": "pink",
    "burtonOnTrent-tamworth": "pink", "nuneaton-tamworth": "pink", "tamworth-walsall": "pink",
    "birmingham-tamworth": "pink", "birmingham-nuneaton": "pink",
    "coalbrookdale-kidderminster": "pink", "kidderminster-worcester": "pink",
    "gloucester-worcester": "pink", "birmingham-worcester": "pink",
    "dudley-wolverhampton": "yellow", "dudley-kidderminster": "yellow",
    "birmingham-redditch": "yellow", "gloucester-redditch": "yellow"
  }
};

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

(async () => {
  for (const [file, gt] of Object.entries(GT)) {
    const img = await Jimp.read(path.join(__dirname, "../../tmp/", file));
    const W = img.bitmap.width;
    console.log("==", file);
    for (const [id, color] of Object.entries(gt)) {
      const [nx, ny] = coords[id];
      const cx = Math.round(nx * W), cy = Math.round(ny * W), R = 100;
      // collect saturated pixels, average the top-saturation cluster
      const sat = [];
      for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
        if (dx * dx + dy * dy > R * R) continue;
        const c = Jimp.intToRGBA(img.getPixelColor(cx + dx, cy + dy));
        const [h, s, v] = rgb2hsv(c.r, c.g, c.b);
        sat.push([h, s, v]);
      }
      sat.sort((a, b) => b[1] - a[1]);
      const top = sat.slice(0, Math.max(20, sat.length * 0.05));
      const mh = Math.round(circMean(top.map((x) => x[0])));
      const ms = (top.reduce((a, x) => a + x[1], 0) / top.length).toFixed(2);
      const mv = (top.reduce((a, x) => a + x[2], 0) / top.length).toFixed(2);
      // also brightest cluster for white
      const byV = [...sat].sort((a, b) => b[2] - a[2]).slice(0, Math.max(20, sat.length * 0.05));
      const bs = (byV.reduce((a, x) => a + x[1], 0) / byV.length).toFixed(2);
      const bv = (byV.reduce((a, x) => a + x[2], 0) / byV.length).toFixed(2);
      console.log(`${color.padEnd(6)} ${id.padEnd(30)} topSat: H${String(mh).padStart(3)} S${ms} V${mv} | topV: S${bs} V${bv}`);
    }
  }
  function circMean(hs) {
    let x = 0, y = 0;
    for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); }
    let a = Math.atan2(y, x) * 180 / Math.PI;
    return a < 0 ? a + 360 : a;
  }
})();
function circMean(hs) {
  let x = 0, y = 0;
  for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); }
  let a = Math.atan2(y, x) * 180 / Math.PI;
  return a < 0 ? a + 360 : a;
}
