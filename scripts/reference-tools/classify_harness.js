// v2: block-averaged chroma/luma diff with local exposure compensation.
const Jimp = require("jimp");
const path = require("path");
const coords = require("./coords.json");
const GT = require("./gt.json");

const P = 100;      // patch half-size (canonical px)
const CELL = 8;     // block size -> 25x25 cells
const CENTER_R = 60; // token must be near the calibrated point

async function loadImg(file) {
  return Jimp.read(path.join(__dirname, "../../tmp/", file));
}

function cellGrid(img, cx, cy) {
  // returns 25x25 cells of mean [r,g,b]
  const n = (2 * P) / CELL;
  const cells = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    let r = 0, g = 0, b = 0, k = 0;
    for (let dy = 0; dy < CELL; dy += 2) for (let dx = 0; dx < CELL; dx += 2) {
      const c = Jimp.intToRGBA(img.getPixelColor(cx - P + gx * CELL + dx, cy - P + gy * CELL + dy));
      r += c.r; g += c.g; b += c.b; k++;
    }
    cells.push([r / k, g / k, b / k]);
  }
  return cells;
}

const chroma = ([r, g, b]) => { const s = r + g + b + 1e-6; return [r / s, g / s]; };
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

function classifyPatch(pc, rc, gain) {
  const n = Math.sqrt(pc.length) | 0;
  const scores = [], dys = [];
  for (let i = 0; i < pc.length; i++) {
    const c = pc[i].map((v, k) => v * gain[k]);
    dys.push(luma(c) - luma(rc[i]));
  }
  const sorted = [...dys].sort((a, b) => a - b);
  const medDy = sorted[(sorted.length / 2) | 0];
  const masked = [];
  for (let i = 0; i < pc.length; i++) {
    const gx = i % n, gy = (i / n) | 0;
    const px = gx * CELL + CELL / 2 - P, py = gy * CELL + CELL / 2 - P;
    if (px * px + py * py > CENTER_R * CENTER_R) continue;
    const c = pc[i].map((v, k) => v * gain[k]);
    const [pu, pv] = chroma(c), [ru, rv] = chroma(rc[i]);
    const dChroma = Math.hypot(pu - ru, pv - rv) * 500;
    const dLuma = Math.abs(dys[i] - medDy);
    const score = dChroma + dLuma * 0.4;
    scores.push(score);
    if (score > 28) masked.push(c);
  }
  const frac = masked.length / scores.length;
  return { frac, masked };
}

const PROTOS = {}; // filled from calibration pass

function nearestProto(mean, side) {
  const s = mean[0] + mean[1] + mean[2] + 1e-6;
  const u = mean[0] / s, v = mean[1] / s;
  let best = null, bestD = 1e9, second = 1e9;
  for (const [name, p] of Object.entries(PROTOS[side] || {})) {
    const d = Math.hypot(u - p[0], v - p[1]);
    if (d < bestD) { second = bestD; bestD = d; best = name; }
    else if (d < second) second = d;
  }
  return { best, bestD, margin: second - bestD, uv: [u.toFixed(3), v.toFixed(3)] };
}

(async () => {
  // pass 1: print masked means for GT links to calibrate prototypes
  const data = {};
  for (const [file, meta] of Object.entries(GT)) {
    const img = await loadImg(file);
    const ref = await loadImg(`canonical_${meta.side}.jpg`);
    const W = img.bitmap.width;
    const patches = {};
    for (const [id, pos] of Object.entries(coords)) {
      const pts = Array.isArray(pos[0]) ? pos : [pos];
      patches[id] = pts.map(([nx, ny]) => {
        const cx = Math.round(nx * W), cy = Math.round(ny * W);
        return { pc: cellGrid(img, cx, cy), rc: cellGrid(ref, cx, cy) };
      });
    }
    // global gain: median ratio over all cells
    const ratios = [[], [], []];
    for (const { pc, rc } of Object.values(patches).flat()) {
      for (let i = 0; i < pc.length; i++) for (let c = 0; c < 3; c++) {
        if (pc[i][c] > 25 && pc[i][c] < 230 && rc[i][c] > 25 && rc[i][c] < 230) ratios[c].push(rc[i][c] / pc[i][c]);
      }
    }
    const gain = ratios.map((r) => { r.sort((a, b) => a - b); return r[(r.length / 2) | 0]; });
    data[file] = { patches, gain, meta };
    if (process.env.CALIB) {
      console.log("==", file, "gain", gain.map((x) => x.toFixed(2)).join("/"));
      for (const [id, truth] of Object.entries(meta.links)) {
        const { frac, masked } = patches[id].map((pt) => classifyPatch(pt.pc, pt.rc, gain)).reduce((a, b) => (b.frac > a.frac ? b : a));
        const mean = masked.length ? masked.reduce((a, c) => a.map((v, k) => v + c[k]), [0, 0, 0]).map((v) => (v / masked.length) | 0) : null;
        console.log(truth.padEnd(6), id.padEnd(30), "frac", frac.toFixed(2), "mean", mean);
      }
      const empties = Object.keys(coords).filter((id) => !meta.links[id]);
      let maxFrac = 0, sum = 0;
      for (const id of empties) {
        const { frac } = classifyPatch(patches[id].pc, patches[id].rc, gain);
        maxFrac = Math.max(maxFrac, frac); sum += frac;
      }
      console.log("empties: mean frac", (sum / empties.length).toFixed(3), "max", maxFrac.toFixed(2));
    }
  }
  if (process.env.CALIB) return;

  // pass 2: three-way decision with session color constraint
  Object.assign(PROTOS, JSON.parse(require("fs").readFileSync("protos.json", "utf8")));
  const SESSION = { "warped_canal.jpg": ["pink", "red", "yellow"], "warped_rail.jpg": ["pink", "white", "yellow"] };
  const ERA = { "warped_canal.jpg": "canal", "warped_rail.jpg": "rail" };
  const RAIL_ONLY = new Set(["belper-leek", "derby-uttoxeter", "stone-uttoxeter", "burtonOnTrent-cannock",
    "tamworth-walsall", "birmingham-nuneaton", "coventry-nuneaton", "birmingham-redditch"]);
  const CANAL_ONLY = new Set(["burtonOnTrent-walsall"]);
  let wrongAuto = 0, review = 0, okAuto = 0, total = 0;
  for (const [file, { patches, gain, meta }] of Object.entries(data)) {
    console.log("==", file);
    const allowed = SESSION[file];
    for (const id of Object.keys(coords)) {
      const truth = meta.links[id] || "empty";
      const era = ERA[file];
      const eraInvalid = (era === "canal" && RAIL_ONLY.has(id)) || (era === "rail" && CANAL_ONLY.has(id));
      const results = patches[id].map((pt) => classifyPatch(pt.pc, pt.rc, gain));
      const { frac, masked } = results.reduce((a, b) => (b.frac > a.frac ? b : a));
      let got = "empty", state = "auto", d = 0, margin = 1;
      if (eraInvalid) {
        // this link cannot exist this era; a strong detection here means a
        // neighbouring link's tile drifted -> send to review, else empty
        if (frac >= 0.12) {
          total++; review++;
          console.log(`REVIEW ${id.padEnd(30)} truth=${truth.padEnd(6)} (era-invalid position, tile nearby?) frac=${frac.toFixed(2)}`);
        } else { total++; if (truth === "empty") okAuto++; else { wrongAuto++; console.log(`WRONG-AUTO ${id} era-skip but truth=${truth}`); } }
        continue;
      }
      if (frac >= 0.06 && masked.length) {
        const mean = masked.reduce((a, c) => a.map((v, k) => v + c[k]), [0, 0, 0]).map((v) => v / masked.length);
        const s2 = mean[0] + mean[1] + mean[2] + 1e-6;
        const u = mean[0] / s2, v = mean[1] / s2;
        let best = null, bestD = 1e9, second = 1e9;
        for (const name of allowed) {
          const pr = PROTOS[meta.side][name];
          const dd = Math.hypot(u - pr[0], v - pr[1]);
          if (dd < bestD) { second = bestD; bestD = dd; best = name; }
          else if (dd < second) second = dd;
        }
        d = bestD; margin = second - bestD;
        if (bestD <= 0.05) got = best;
        // neutral or unmatched masks in a session without white are glare or
        // foreign objects, not player tiles -> auto-empty unless huge
        if (got === "empty" && frac < 0.30) state = "auto";
        else if (frac < 0.15 || bestD > 0.04 || margin < 0.02) state = "review";
      } else if (frac >= 0.05) {
        state = "review"; // borderline emptiness
      }
      total++;
      if (state === "review") { review++; console.log(`REVIEW ${id.padEnd(30)} truth=${truth.padEnd(6)} guess=${got.padEnd(6)} frac=${frac.toFixed(2)} d=${d.toFixed(3)} m=${margin.toFixed(3)}`); }
      else if (got === truth) okAuto++;
      else { wrongAuto++; console.log(`WRONG-AUTO ${id.padEnd(30)} truth=${truth.padEnd(6)} got=${got.padEnd(6)} frac=${frac.toFixed(2)} d=${d.toFixed(3)} m=${margin.toFixed(3)}`); }
    }
  }
  console.log(`auto-correct: ${okAuto}/${total}, review: ${review}, WRONG-AUTO: ${wrongAuto}`);
})().catch((e) => { console.error(e); process.exit(1); });
