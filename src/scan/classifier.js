// Pure classification logic for the board scanner. Works on ImageData-like
// objects ({data, width, height} RGBA) in the canonical board frame, so it is
// unit-testable without OpenCV or a DOM. Method and thresholds were tuned
// against four real games (156 link positions: 144 auto-correct, 12 review,
// 0 wrong automatic answers); see scripts/reference-tools/evaluate.mjs.
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

const MASK_SCORE_THRESHOLD = 28;
const PROTO_MAX_DIST = 0.05;
// Colored detections need this much mass to auto-assign. Banner-and-fold
// ghosts measured 0.14-0.18 in the field; real tiles measure >= 0.19.
const AUTO_MIN_FRAC = 0.2;
const AUTO_MAX_DIST = 0.04;
const AUTO_MIN_MARGIN = 0.02;
// Real tiles measured frac >= 0.17 in ground truth; sub-0.12 detections are
// noise (glare, print differences) and are dropped without asking.
export const DETECT_MIN_FRAC = 0.12;
const UNMATCHED_EMPTY_MAX_FRAC = 0.3;
const UNMATCHED_REVIEW_MAX_DIST = 0.09;

export function linkSamplePoints(linkId) {
  const pos = LINK_POSITIONS[linkId];
  return Array.isArray(pos[0]) ? pos : [pos];
}

// Index of the sample point with the strongest detection.
export const strongestIndex = (results) =>
  results.reduce((a, _, i) => (results[i].frac > results[a].frac ? i : a), 0);

// Where the tile actually sits: the calibrated sample point, shifted to the
// detected mask centroid when there is a detection. Empty links still get
// the local alignment shift, so their dots land on the photo's actual spot
// when the global homography has a residual there. Normalized coords.
export function detectedPoint(linkId, result) {
  const pts = linkSamplePoints(linkId);
  const [nx, ny] = pts[(result && result.bestIndex) || 0];
  const [ox, oy] =
    result && result.frac >= DETECT_MIN_FRAC && result.centroid
      ? result.centroid
      : (result && result.shift) || [0, 0];
  return [nx + ox / CANONICAL_SIZE, ny + oy / CANONICAL_SIZE];
}

// Parse public/scan/ref_*.bin: [uint32 n][n*2 float32 x,y][n*32 uint8 desc]
export function parseRefBin(buffer) {
  const n = new DataView(buffer).getUint32(0, true);
  const pts = new Float32Array(buffer, 4, n * 2);
  const desc = new Uint8Array(buffer, 4 + n * 8, n * 32);
  return { n, pts, desc };
}

// A single global homography cannot model the bulge of a folded board; the
// residual misalignment (up to ~25px) makes high-contrast art ghost into the
// diff. Patches are therefore re-aligned locally before diffing.
export const ALIGN_MARGIN = 24; // px search radius, must be a multiple of CELL

// Block-average an image region centered at (cx, cy) into cells of mean RGB.
export function cellGrid(imageData, cx, cy, halfSize = PATCH_HALF) {
  const { data, width, height } = imageData;
  const n = (2 * halfSize) / CELL;
  const cells = [];
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      let r = 0, g = 0, b = 0, k = 0;
      for (let dy = 0; dy < CELL; dy += 2) {
        for (let dx = 0; dx < CELL; dx += 2) {
          const x = cx - halfSize + gx * CELL + dx;
          const y = cy - halfSize + gy * CELL + dy;
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

// Pick the sub-grid of an enlarged scan patch that best matches the
// reference patch (zero-mean luma correlation over cell shifts), undoing the
// local residual of the global homography. Returns the aligned cells plus the
// shift in canonical px from the calibrated point to the aligned patch
// center; mask centroids are relative to that shifted center, so consumers
// need the shift to place a blob in board coordinates.
export function alignPatch(pcLarge, rc) {
  const nRef = Math.sqrt(rc.length) | 0;
  const nLarge = Math.sqrt(pcLarge.length) | 0;
  const m = (nLarge - nRef) / 2;
  const lumaL = pcLarge.map(luma);
  const lumaR = rc.map(luma);
  const meanR = lumaR.reduce((a, b) => a + b, 0) / lumaR.length;
  let best = null, bestScore = -Infinity;
  for (let sy = 0; sy <= 2 * m; sy++) {
    for (let sx = 0; sx <= 2 * m; sx++) {
      let sum = 0;
      for (let i = 0; i < lumaR.length; i++) {
        const gx = i % nRef, gy = (i / nRef) | 0;
        sum += lumaL[(gy + sy) * nLarge + (gx + sx)];
      }
      const meanL = sum / lumaR.length;
      let corr = 0;
      for (let i = 0; i < lumaR.length; i++) {
        const gx = i % nRef, gy = (i / nRef) | 0;
        corr += (lumaL[(gy + sy) * nLarge + (gx + sx)] - meanL) * (lumaR[i] - meanR);
      }
      if (corr > bestScore) { bestScore = corr; best = [sx, sy]; }
    }
  }
  const [sx, sy] = best;
  const out = new Array(rc.length);
  for (let i = 0; i < rc.length; i++) {
    const gx = i % nRef, gy = (i / nRef) | 0;
    out[i] = pcLarge[(gy + sy) * nLarge + (gx + sx)];
  }
  return { cells: out, shift: [(sx - m) * CELL, (sy - m) * CELL] };
}
const chroma = ([r, g, b]) => {
  const s = r + g + b + 1e-6;
  return [r / s, g / s];
};

// Compare one photo patch against the empty-board reference patch.
// Chroma difference dominates; luma difference is compensated by the patch
// median so shadows and glare gradients do not fire the mask.
// The mask covers the FULL patch (not just the decision disc): blobs
// straddling the disc edge must be seen whole so component filtering can
// judge and assign them; only in-disc cells count toward frac/color.
function maskPatch(pc, rc, gain) {
  const n = Math.sqrt(pc.length) | 0;
  const dys = pc.map((cell, i) => luma(cell.map((v, k) => v * gain[k])) - luma(rc[i]));
  const sorted = [...dys].sort((a, b) => a - b);
  const medDy = sorted[(sorted.length / 2) | 0];
  const cells = [];
  let cellsInDisc = 0;
  for (let i = 0; i < pc.length; i++) {
    const gx = i % n, gy = (i / n) | 0;
    const px = gx * CELL + CELL / 2 - PATCH_HALF;
    const py = gy * CELL + CELL / 2 - PATCH_HALF;
    const inDisc = px * px + py * py <= CENTER_R * CENTER_R;
    if (inDisc) cellsInDisc++;
    const c = pc[i].map((v, k) => v * gain[k]);
    const [pu, pv] = chroma(c);
    const [ru, rv] = chroma(rc[i]);
    const dChroma = Math.hypot(pu - ru, pv - rv) * 500;
    const dLuma = Math.abs(dys[i] - medDy);
    if (dChroma + dLuma * 0.4 > MASK_SCORE_THRESHOLD) {
      cells.push({ px, py, c, pl: luma(c), rl: luma(rc[i]), inDisc });
    }
  }
  return { cells, cellsInDisc };
}

// Reduce a masked-cell set to the per-patch decision values. frac, the color
// samples and the centroid all come from the in-disc cells only, matching
// the thresholds tuned on disc-based masks.
function finishPatch(cells, cellsInDisc) {
  const inDisc = cells.filter((c) => c.inDisc);
  let sumX = 0, sumY = 0;
  for (const c of inDisc) { sumX += c.px; sumY += c.py; }
  // Mask centroid (relative to the patch center). Comparing centroids of
  // neighbouring patches in board coordinates tells one shared blob apart
  // from two separate tiles.
  const centroid = inDisc.length
    ? [sumX / inDisc.length, sumY / inDisc.length]
    : [0, 0];
  return {
    frac: cellsInDisc ? inDisc.length / cellsInDisc : 0,
    masked: inDisc.map((c) => c.c),
    centroid,
  };
}

// One-shot mask + stats, without glare filtering or alignment. Unit tests
// and the reference tooling use this raw form.
export function classifyPatch(pc, rc, gain) {
  const { cells, cellsInDisc } = maskPatch(pc, rc, gain);
  return finishPatch(cells, cellsInDisc);
}

// The full per-patch classification used in production: mask the diff, split
// it into connected components, drop glare blobs, and express the centroid
// (and each kept component's centroid) relative to the CALIBRATED point by
// folding in the local alignment shift. Every coordinate a consumer sees
// from here on uses that one convention.
export function classifyAlignedPatch(pc, rc, gain, shift) {
  const { cells, cellsInDisc } = maskPatch(pc, rc, gain);
  const comps = splitComponents(cells).filter((c) => !isGlare(c));
  const r = finishPatch(comps.flatMap((c) => c.cells), cellsInDisc);
  const fold = ([x, y]) => [x + shift[0], y + shift[1]];
  return {
    ...r,
    shift,
    centroid: fold(r.centroid),
    comps: comps.map((c) => ({ ...c, centroid: fold(c.centroid) })),
  };
}

// Glare (a sheen on the glossy board) desaturates a region toward neutral
// white, which fires the chroma mask just like a white tile. The tell: the
// board art stays visible through glare, so the photo's luma still tracks
// the reference's, while a real tile hides the art completely. Measured on
// four games: glare/ghost blobs correlate >= 0.7, real tiles <= 0.36.
export const GLARE_CORR = 0.55;
export const GLARE_MIN_CELLS = 8;

export const isGlare = (comp) =>
  comp.cells.length >= GLARE_MIN_CELLS && comp.corr >= GLARE_CORR;

// Split a patch's masked cells into 8-connected components on the cell grid.
// Cells are keyed by integer grid index; the 64 stride is safe because patch
// grids are far narrower than 64 cells, so rows cannot collide.
export function splitComponents(cells) {
  const key = (c) => ((c.py / CELL) | 0) * 64 + ((c.px / CELL) | 0);
  const byKey = new Map(cells.map((c) => [key(c), c]));
  const seen = new Set();
  const comps = [];
  for (const cell of cells) {
    const k0 = key(cell);
    if (seen.has(k0)) continue;
    seen.add(k0);
    const members = [];
    const queue = [cell];
    while (queue.length) {
      const cur = queue.pop();
      members.push(cur);
      const k = key(cur);
      for (const d of [-65, -64, -63, -1, 1, 63, 64, 65]) {
        const nb = byKey.get(k + d);
        if (nb && !seen.has(k + d)) {
          seen.add(k + d);
          queue.push(nb);
        }
      }
    }
    comps.push(makeComponent(members));
  }
  return comps;
}

function makeComponent(cells) {
  let sx = 0, sy = 0, mp = 0, mr = 0;
  for (const c of cells) { sx += c.px; sy += c.py; mp += c.pl; mr += c.rl; }
  const n = cells.length;
  mp /= n; mr /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const c of cells) {
    sxy += (c.pl - mp) * (c.rl - mr);
    sxx += (c.pl - mp) ** 2;
    syy += (c.rl - mr) ** 2;
  }
  const corr = n >= 2 ? sxy / Math.sqrt(sxx * syy + 1e-9) : 0;
  return { cells, centroid: [sx / n, sy / n], corr };
}

function nearestProto(uv, side, allowed) {
  const [u, v] = uv;
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
// chromaOffset: per-scan color adaptation [du, dv], estimated from the
// scan's confident detections and subtracted from every blob's chroma so a
// camera or lighting tint measured on one color corrects the others too.
export function decideLink({ results, allowed, side, chromaOffset = [0, 0] }) {
  const bestIndex = strongestIndex(results);
  const { frac, masked, centroid, shift } = results[bestIndex];
  if (frac < DETECT_MIN_FRAC) {
    return { state: "auto", color: null, frac, bestIndex, centroid, shift };
  }
  const mean = masked
    .reduce((a, c) => a.map((v, k) => v + c[k]), [0, 0, 0])
    .map((v) => v / masked.length);
  const uvRaw = chroma(mean);
  const uv = [uvRaw[0] - chromaOffset[0], uvRaw[1] - chromaOffset[1]];
  const { best, bestD, margin } = nearestProto(uv, side, allowed);
  const color = bestD <= PROTO_MAX_DIST ? best : null;
  let state = "auto";
  if (color === null) {
    // Not any session color: glare or a foreign object. Ask only when it is
    // both large and vaguely tile-colored; far-off chroma (a blue window
    // reflection) is never a tile, whatever its size.
    if (frac >= UNMATCHED_EMPTY_MAX_FRAC && bestD < UNMATCHED_REVIEW_MAX_DIST) {
      state = "review";
    }
  } else if (frac < AUTO_MIN_FRAC || bestD > AUTO_MAX_DIST || margin < AUTO_MIN_MARGIN) {
    state = "review";
  }
  return { state, color, frac, dist: bestD, margin, bestIndex, centroid, shift, uv: uvRaw };
}

// Estimate the scan-wide chroma tint from confident first-pass detections:
// the mean deviation of their blobs from their matched prototypes.
export function estimateChromaOffset(firstPass, side) {
  // Only strong tiles qualify: banner/fold ghosts measured up to ~0.25 frac
  // and can look chromatically perfect, so they must not steer the offset.
  const confident = firstPass.filter(
    (r) => r.color && r.dist < 0.035 && r.frac >= 0.3 && r.uv
  );
  if (!confident.length) return [0, 0];
  let du = 0, dv = 0;
  for (const r of confident) {
    const p = PROTOS[side][r.color];
    du += r.uv[0] - p[0];
    dv += r.uv[1] - p[1];
  }
  du /= confident.length;
  dv /= confident.length;
  // Cap the correction so a few odd detections cannot drag everything.
  const mag = Math.hypot(du, dv);
  const cap = 0.03;
  if (mag > cap) { du *= cap / mag; dv *= cap / mag; }
  return [du, dv];
}
