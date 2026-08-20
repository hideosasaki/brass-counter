// Pure classification logic for the board scanner. Works on ImageData-like
// objects ({data, width, height} RGBA) in the canonical board frame, so it is
// unit-testable without OpenCV or a DOM. Method and thresholds were tuned
// against two real games (78 link positions: 68 auto-correct, 10 review,
// 0 wrong automatic answers); see scripts/reference-tools/classify_harness.js.
import { LINK_POSITIONS } from "../linkPositions";

export const CANONICAL_SIZE = 2048;
export const PATCH_HALF = 100; // patch half-size in canonical px
export const CELL = 8; // block-average cell size
export const CENTER_R = 60; // the tile must be near the calibrated point

// Token color prototypes in chromaticity space (r/(r+g+b), g/(r+g+b)),
// measured per board side from real photos.
export const PROTOS = {
  day: { pink: [0.35, 0.285], red: [0.42, 0.29], yellow: [0.39, 0.355], white: [0.325, 0.327] },
  night: { pink: [0.355, 0.275], red: [0.42, 0.29], yellow: [0.4, 0.355], white: [0.318, 0.325] },
};

// Physical token color class for each app player color.
export const APP_COLOR_CLASS = {
  "#7c69dc": "pink",
  "#dbc118": "yellow",
  "#c7bcb5": "white",
  "#ad3d1e": "red",
};

const MASK_SCORE_THRESHOLD = 28;
const PROTO_MAX_DIST = 0.05;
const AUTO_MIN_FRAC = 0.15;
const AUTO_MAX_DIST = 0.04;
const AUTO_MIN_MARGIN = 0.02;
// Real tiles measured frac >= 0.17 in ground truth; sub-0.12 detections are
// noise (glare, print differences) and are dropped without asking.
const DETECT_MIN_FRAC = 0.12;
const UNMATCHED_EMPTY_MAX_FRAC = 0.3;

export function linkSamplePoints(linkId) {
  const pos = LINK_POSITIONS[linkId];
  return Array.isArray(pos[0]) ? pos : [pos];
}

// Parse public/scan/ref_*.bin: [uint32 n][n*2 float32 x,y][n*32 uint8 desc]
export function parseRefBin(buffer) {
  const n = new DataView(buffer).getUint32(0, true);
  const pts = new Float32Array(buffer, 4, n * 2);
  const desc = new Uint8Array(buffer, 4 + n * 8, n * 32);
  return { n, pts, desc };
}

// Block-average an image region centered at (cx, cy) into cells of mean RGB.
export function cellGrid(imageData, cx, cy) {
  const { data, width, height } = imageData;
  const n = (2 * PATCH_HALF) / CELL;
  const cells = [];
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      let r = 0, g = 0, b = 0, k = 0;
      for (let dy = 0; dy < CELL; dy += 2) {
        for (let dx = 0; dx < CELL; dx += 2) {
          const x = cx - PATCH_HALF + gx * CELL + dx;
          const y = cy - PATCH_HALF + gy * CELL + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const i = (y * width + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; k++;
        }
      }
      cells.push(k ? [r / k, g / k, b / k] : [0, 0, 0]);
    }
  }
  return cells;
}

// Global per-channel gain photo -> reference (median of ratios; robust to
// the small fraction of cells covered by tokens).
export function fitGain(patchPairs) {
  const ratios = [[], [], []];
  for (const { pc, rc } of patchPairs) {
    for (let i = 0; i < pc.length; i++) {
      for (let c = 0; c < 3; c++) {
        if (pc[i][c] > 25 && pc[i][c] < 230 && rc[i][c] > 25 && rc[i][c] < 230) {
          ratios[c].push(rc[i][c] / pc[i][c]);
        }
      }
    }
  }
  return ratios.map((r) => {
    if (!r.length) return 1;
    r.sort((a, b) => a - b);
    return r[(r.length / 2) | 0];
  });
}

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const chroma = ([r, g, b]) => {
  const s = r + g + b + 1e-6;
  return [r / s, g / s];
};

// Compare one photo patch against the empty-board reference patch.
// Chroma difference dominates; luma difference is compensated by the patch
// median so shadows and glare gradients do not fire the mask.
export function classifyPatch(pc, rc, gain) {
  const n = Math.sqrt(pc.length) | 0;
  const dys = pc.map((cell, i) => luma(cell.map((v, k) => v * gain[k])) - luma(rc[i]));
  const sorted = [...dys].sort((a, b) => a - b);
  const medDy = sorted[(sorted.length / 2) | 0];
  const masked = [];
  let cellsInDisc = 0;
  for (let i = 0; i < pc.length; i++) {
    const gx = i % n, gy = (i / n) | 0;
    const px = gx * CELL + CELL / 2 - PATCH_HALF;
    const py = gy * CELL + CELL / 2 - PATCH_HALF;
    if (px * px + py * py > CENTER_R * CENTER_R) continue;
    cellsInDisc++;
    const c = pc[i].map((v, k) => v * gain[k]);
    const [pu, pv] = chroma(c);
    const [ru, rv] = chroma(rc[i]);
    const dChroma = Math.hypot(pu - ru, pv - rv) * 500;
    const dLuma = Math.abs(dys[i] - medDy);
    if (dChroma + dLuma * 0.4 > MASK_SCORE_THRESHOLD) masked.push(c);
  }
  return { frac: cellsInDisc ? masked.length / cellsInDisc : 0, masked };
}

function nearestProto(mean, side, allowed) {
  const [u, v] = chroma(mean);
  let best = null, bestD = Infinity, second = Infinity;
  for (const name of allowed) {
    const p = PROTOS[side][name];
    const d = Math.hypot(u - p[0], v - p[1]);
    if (d < bestD) { second = bestD; bestD = d; best = name; }
    else if (d < second) second = d;
  }
  return { best, bestD, margin: second - bestD };
}

// Three-way decision for one link from its sample-point results.
// state: "auto" (trusted) or "review" (ask the human). color: class or null.
export function decideLink({ results, allowed, side }) {
  const { frac, masked } = results.reduce((a, b) => (b.frac > a.frac ? b : a));
  if (frac < DETECT_MIN_FRAC) {
    return { state: "auto", color: null, frac };
  }
  const mean = masked
    .reduce((a, c) => a.map((v, k) => v + c[k]), [0, 0, 0])
    .map((v) => v / masked.length);
  const { best, bestD, margin } = nearestProto(mean, side, allowed);
  const color = bestD <= PROTO_MAX_DIST ? best : null;
  let state = "auto";
  if (color === null) {
    // Not any session color: glare or a foreign object. Empty unless huge.
    if (frac >= UNMATCHED_EMPTY_MAX_FRAC) state = "review";
  } else if (frac < AUTO_MIN_FRAC || bestD > AUTO_MAX_DIST || margin < AUTO_MIN_MARGIN) {
    state = "review";
  }
  return { state, color, frac, dist: bestD, margin };
}
