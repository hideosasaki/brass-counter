// Pure classification logic for the board scanner. Works on ImageData-like
// objects ({data, width, height} RGBA) in the canonical board frame, so it is
// unit-testable without OpenCV or a DOM. Method and thresholds were tuned
// against eight photos of six real board states (262 link positions the
// scanner decides: 246 auto-correct, 16 review, no wrong automatic answers);
// see scripts/reference-tools/evaluate.mjs.
//
// Six of those photos were taken in daylight. The other two are the same board
// shot from two directions under indoor light, and all but one of the
// questions left is in them. Nothing is answered wrong any more, but read that as the corpus being
// small rather than as the problem being finished: the last three wrong answers
// were tiles washed colorless and dim, indistinguishable from empty board on
// every measure the patch itself carries, and what finally caught them was the
// shadow they cast on the board beside them. That is a real cue and a thin one.
// Behind it stands the map screen, which asks the player to compare with the
// board.
import { LINK_POSITIONS } from "../linkPositions";
import { LINK_MASKS } from "../linkMasks";

export const CANONICAL_SIZE = 2048;
export const PATCH_HALF = 100; // patch half-size in canonical px
export const CELL = 8; // block-average cell size
export const CENTER_R = 60; // fallback radius for links with no traced mask

// Token color prototypes in chromaticity space (r/(r+g+b), g/(r+g+b)), fitted
// per board side to the mean of the ground-truth tiles by
// scripts/reference-tools/fit_protos.mjs. What each one rests on, since the
// numbers differ a lot and anyone tuning AUTO_MIN_MARGIN needs to know which to
// trust: day yellow 24 tiles over 5 photos, red 22 over 5, pink 18 over 4,
// white 12 over 3; night pink 12 and white 10, both from the one night photo
// there is, so those two carry that photo's lighting as well as the tokens'.
// Night red has never appeared in a photo and night yellow only four times, so
// those two are still the original hand-measured values.
//
// Fitting these matters more than it looks. A prototype off its own cluster
// costs margin against the neighbouring color, and decideLink turns thin margin
// into a question, so a mis-centred prototype reads as "this color recognises
// badly" while in fact every tile was identified correctly. Pink is where it
// showed: it is the closest color to white on both sides (0.038 apart on the
// day board against 0.068 or more for every other pair), and the day prototype
// sat 0.0116 off its cluster toward white, which took its worst margin down to
// 0.012 against the 0.02 needed to answer without asking. Worth keeping in
// proportion: within-cluster spread runs 0.004 (day white) to 0.012 (day red),
// so a prototype is only meaningful to about that precision.
export const PROTOS = {
  day: { pink: [0.3416, 0.2833], red: [0.4358, 0.2887], yellow: [0.4136, 0.3455], white: [0.3224, 0.3187] },
  night: { pink: [0.3567, 0.2752], red: [0.42, 0.29], yellow: [0.4, 0.355], white: [0.3154, 0.3222] },
};

const MASK_SCORE_THRESHOLD = 28;
const PROTO_MAX_DIST = 0.05;
// Colored detections need this much mass to auto-assign. Banner-and-fold
// ghosts measured 0.14-0.18 in the field; real tiles measure >= 0.19.
const AUTO_MIN_FRAC = 0.2;
const AUTO_MAX_DIST = 0.04;
// How far the matched color has to beat the runner-up by, per board face. Kept
// as a table for the same reason PROTOS is one: which face is printed up
// changes the number.
//
// Indoor light does not push a tile's color onto another prototype; it pulls
// the whole palette in toward neutral, so a reading stays nearest the right
// color and loses its lead. Fifteen of the twenty-six questions the ground
// truth produced before the shadow veto were this, every one on the two night
// photos, thirteen of them already reading correctly. They measured margin
// 0.005 to 0.019 at dist 0.023 to 0.034, well inside AUTO_MAX_DIST - which is
// what tells a shrunk reading from an ambiguous one, and why the distance cut
// is left alone and only this is relaxed.
//
// Sweeping the night cut against that same pre-veto baseline: 0.010 leaves
// seventeen questions, 0.005 leaves thirteen, and at 0 a fourth link answers
// wrong. The link that turns (burtonOnTrent-derby) sits at margin 0.004, so
// 0.005 would be touching it. The day face keeps the full 0.02 - no question
// there ever came from margin, so there is nothing to buy and a wrong answer
// to risk.
export const AUTO_MIN_MARGIN = { day: 0.02, night: 0.01 };
// Real tiles measured frac >= 0.17 in ground truth; sub-0.12 detections are
// noise (glare, print differences) and are dropped without asking.
export const DETECT_MIN_FRAC = 0.12;
// Brightness over the surrounding board, in 0-255, that a colorless detection
// has to carry to be a token; and how close to plain neutral counts as
// colorless. Reasoned about in decideLink. Real white tiles measured lift 16.9
// and up and sat 0.026 from neutral at their most neutral; the palest real
// colored tile sat 0.042 from it; empty board read 12.3 and under, and -2 on
// the phone photo that prompted this. Both cuts sit in those gaps.
export const NEUTRAL_MIN_LIFT = 14;
// How much of the decision region a colorless dim blob may cover and still be
// read as displaced print rather than asked about. Reasoned about in decideLink.
export const RESIDUE_MAX_FRAC = 0.4;
// A patch this much brighter than the rest of the scan is under a reflection,
// and a pale reading taken inside it is not evidence of anything. Reasoned
// about in decideLink. Both cuts sit between measured populations: patches that
// answered wrong ran 48.1 and above over their scan's median against 44.0 for
// the brightest that answered correctly, and the washed-out readings sat 0.036
// and 0.052 from neutral where a saturated tile reads 0.07 (yellow) to 0.10
// (red). Judging the reading rather than the color it matched matters: the
// prototypes move whenever fit_protos.mjs runs, and night pink and night yellow
// sit 0.007 apart in distance from neutral, inside their own cluster spread.
export const WASHOUT_MIN_LIFT = 45;
export const WASHOUT_MAX_DIST = 0.06;
// A tile sits on the board and throws a shadow onto the board beside it. How
// far below the patch's own median a cell has to fall to be counted as in that
// shadow, and how much of the board around the decision region may be in
// shadow before an empty answer is refused. Reasoned about in decideLink.
export const SHADOW_DARK_DY = -12;
export const SHADOW_MAX_DARK_OUT = 0.24;
const NEUTRAL_UV = [1 / 3, 1 / 3]; // equal parts: no color at all
const NEUTRAL_MAX_DIST = 0.03;
const UNMATCHED_EMPTY_MAX_FRAC = 0.3;
const UNMATCHED_REVIEW_MAX_DIST = 0.09;

export function linkSamplePoints(linkId) {
  const pos = LINK_POSITIONS[linkId];
  return Array.isArray(pos[0]) ? pos : [pos];
}

// The same points in canonical px, rounded the way a patch centre is rounded.
// Anything measuring where a patch sits has to round identically or it measures
// a patch half a cell from the one the scanner uses.
export const samplePointsPx = (linkId) =>
  linkSamplePoints(linkId).map(([nx, ny]) => [
    Math.round(nx * CANONICAL_SIZE),
    Math.round(ny * CANONICAL_SIZE),
  ]);

// Distance in canonical px from a point to a polyline given in normalized
// board coordinates. Exported for the offline mask tools, which have to agree
// with the shipped geometry exactly.
export function distToPoly(x, y, pts) {
  return closestOnPoly(x, y, pts).d;
}

// The point on a polyline nearest to (x, y), with its distance. One definition
// of the geometry, which distToPoly asks for the distance half of.
function closestOnPoly(x, y, pts) {
  let best = { x: pts[0][0] * CANONICAL_SIZE, y: pts[0][1] * CANONICAL_SIZE, d: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0] * CANONICAL_SIZE, ay = pts[i - 1][1] * CANONICAL_SIZE;
    const bx = pts[i][0] * CANONICAL_SIZE, by = pts[i][1] * CANONICAL_SIZE;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(x - qx, y - qy);
    if (d < best.d) best = { x: qx, y: qy, d };
  }
  return best;
}

// Every cell offset in a patch, as [px, py] from its centre. One definition so
// the classifier, the tests and the offline harnesses cannot disagree.
export function patchCellOffsets(halfSize = PATCH_HALF) {
  const n = (2 * halfSize) / CELL;
  const out = [];
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++)
      out.push([gx * CELL + CELL / 2 - halfSize, gy * CELL + CELL / 2 - halfSize]);
  return out;
}

export const DISC_REGION = (px, py) => px * px + py * py <= CENTER_R * CENTER_R;

// Which cells of a patch centred at (cx, cy) a traced band claims, as a
// predicate on the cell's offset from that centre. Every reading of a link is
// taken over this set, so the shipped decision region and the region the
// coverage bound is measured against are the same expression.
export const maskRegion = (mask, cx, cy) => {
  const half = mask.width / 2;
  return (px, py) => distToPoly(cx + px, cy + py, mask.pts) <= half;
};

export const TILE_R = 52; // a link tile is about 104px across

// Where on a band a tile can sit: its centreline, to a cell. Also the set of
// places the offline tool is allowed to put a sample point, so a point and the
// tile it has to read are drawn from the same geometry. Kept per mask: the
// placer asks for the same band's centreline once per candidate point it tries,
// and rasterising it is most of what that costs.
const centrelines = new WeakMap();
export function bandCentreline(mask) {
  if (!centrelines.has(mask)) {
    const half = mask.width / 2;
    const xs = mask.pts.map((p) => p[0] * CANONICAL_SIZE);
    const ys = mask.pts.map((p) => p[1] * CANONICAL_SIZE);
    const cells = [];
    for (let y = Math.min(...ys) - half; y <= Math.max(...ys) + half; y += CELL)
      for (let x = Math.min(...xs) - half; x <= Math.max(...xs) + half; x += CELL)
        if (distToPoly(x, y, mask.pts) <= CELL) cells.push([x, y]);
    centrelines.set(mask, cells);
  }
  return centrelines.get(mask);
}

// The share of a patch's decision region a tile centred at (tx, ty) covers,
// given that region's cells as offsets from the patch centre. The tile is
// treated as a disc of TILE_R rather than the rounded rectangle at an arbitrary
// angle it really is; frac_efficiency.mjs measures real tiles against this same
// disc, so what the approximation costs is already inside the ratios that
// MIN_BAND_TILE_FRAC is derived from.
export function tileFrac(cells, [cx, cy], [tx, ty]) {
  if (!cells.length) return 0;
  let hit = 0;
  for (const [ox, oy] of cells) {
    const dx = cx + ox - tx, dy = cy + oy - ty;
    if (dx * dx + dy * dy <= TILE_R * TILE_R) hit++;
  }
  return hit / cells.length;
}

// The weakest reading a tile on this band can get: for every place on the route
// a tile could sit, the best frac any one of the link's patches would give it,
// reported at the worst such place. A patch only reaches PATCH_HALF from its
// point, so a tile out beyond every point scores nothing at all and the link
// reads empty, which is how a yellow tile on birmingham-worcester's long route
// came back as an empty link.
//
// In frac rather than in covered band cells, because frac is what decideLink
// compares against. The two are not interchangeable: the share of a patch a
// tile fills varies about threefold along a band even where every cell of it is
// covered, so points can close every gap and still leave a real tile reading
// under DETECT_MIN_FRAC. Only tile positions on the centreline are probed,
// since that is where a tile sits.
export function worstBandFrac(mask, points) {
  const offsets = patchCellOffsets();
  const patches = points
    .map((p) => {
      const inRegion = maskRegion(mask, ...p);
      return { p, cells: offsets.filter(([ox, oy]) => inRegion(ox, oy)) };
    })
    .filter((patch) => patch.cells.length);
  let worst = null;
  for (const at of bandCentreline(mask)) {
    let best = 0;
    for (const { p, cells } of patches) best = Math.max(best, tileFrac(cells, p, at));
    if (!worst || best < worst.frac) worst = { frac: best, at };
  }
  // No centreline to probe means nothing about this band is scored, so the
  // weakest reading on it is nothing.
  return worst || { frac: 0, at: null };
}

// The floor every band has to clear. What it buys is an automatic answer, not
// merely a detection: a tile a person can see at a glance must not come back as
// a question because of where along its route it happens to sit. Asking about
// the obvious is the expensive failure here. Misreading a tile dropped
// carelessly across the edge of its route is not - that one is understood by
// whoever placed it, and it is not worth spending questions to avoid.
//
// Real tiles score less than their geometry allows: the printed art under them,
// the tile's own shadow and the alignment residual all cost cells. Over the 103
// ground-truth tiles the weakest kept 0.46 of its ideal frac and the tenth
// percentile kept 0.63 (scripts/reference-tools/frac_efficiency.mjs; the mean is
// 0.81). Answering without asking needs AUTO_MIN_FRAC, so 0.32 covers a tile at
// that tenth percentile and covering the weakest tile ever measured would take
// 0.43. The high end is not reachable at any price: birmingham-worcester tops
// out at 0.42 and burtonOnTrent-stone at 0.39 with ten points each, because a
// patch only ever sees so much of a band that runs past it. So this sits just
// above the tenth-percentile figure, where nine tiles in ten are answered
// wherever they sit and the tenth is asked about rather than missed.
//
// 0.32 and 0.33 place the same points; from 0.34 the count climbs and at 0.35
// cannock-farmNorth cannot be brought up at all, its band being short enough
// that one patch already spans what there is of it. Sitting at the top of that
// flat range costs nothing and leaves the guarantee its margin.
export const MIN_BAND_TILE_FRAC = 0.33;

// Which cells of a patch count toward the decision, as a predicate on the
// cell's offset from the patch centre. The mask is anchored to the board
// rather than to the patch, so the local alignment shift is added back: the
// same printed band is tested however far this photo's homography drifted
// here. A link with no traced mask falls back to the disc.
export function patchRegion(linkId, sampleIndex, shift) {
  const mask = LINK_MASKS[linkId];
  if (!mask) return DISC_REGION;
  const [cx, cy] = samplePointsPx(linkId)[sampleIndex];
  return maskRegion(mask, cx + shift[0], cy + shift[1]);
}

// Index of the sample point with the strongest detection.
const strongestIndex = (results) =>
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
  return ratios.map((r) => (r.length ? median(r) : 1));
}

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// Median of a list of numbers, leaving the caller's array alone.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length / 2) | 0];
};

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
// median so shadows and glare gradients do not fire the diff. That median is
// taken over the whole patch while frac and color come from the region alone,
// so it inherits whatever else the patch extent contains: a neighbouring
// link's tile inside the patch shifts the baseline and can push the printed
// art in the region over the threshold. What keeps that from happening is the
// centring invariant on the sample points (see linkMasks.test.js), not
// anything here.
// The diff covers the FULL patch, not just the decision region: blobs
// straddling the region's edge must be seen whole so component filtering can
// judge and assign them; only cells inside the region count toward frac/color.
function maskPatch(pc, rc, gain, inRegion) {
  const n = Math.sqrt(pc.length) | 0;
  const dys = pc.map((cell, i) => luma(cell.map((v, k) => v * gain[k])) - luma(rc[i]));
  const medDy = median(dys);
  const cells = [];
  const quiet = [];
  let cellsInRegion = 0;
  let darkOutside = 0;
  for (let i = 0; i < pc.length; i++) {
    const gx = i % n, gy = (i / n) | 0;
    const px = gx * CELL + CELL / 2 - PATCH_HALF;
    const py = gy * CELL + CELL / 2 - PATCH_HALF;
    const inside = inRegion(px, py);
    // Outside the band is board the tile can be shading. Measured against the
    // patch's own median rather than an absolute level, so a dim photo reads as
    // no shadow anywhere: what marks a tile out is one side of its surroundings
    // going dark, not the whole patch being dark. Counted here because this
    // loop already has the offsets and the region test, and over cells the diff
    // never scores - a shadow is not a detection.
    if (inside) cellsInRegion++;
    else if (dys[i] - medDy < SHADOW_DARK_DY) darkOutside++;
    const c = pc[i].map((v, k) => v * gain[k]);
    const [pu, pv] = chroma(c);
    const [ru, rv] = chroma(rc[i]);
    const dChroma = Math.hypot(pu - ru, pv - rv) * 500;
    const dLuma = Math.abs(dys[i] - medDy);
    if (dChroma + dLuma * 0.4 > MASK_SCORE_THRESHOLD) {
      cells.push({ px, py, c, pl: luma(c), rl: luma(rc[i]), inRegion: inside });
    } else {
      // Cells the diff left alone are board, so their exposure offset is the
      // honest baseline to measure a blob's brightness against. The patch-wide
      // median cannot serve: a tile covering much of the patch drags it up and
      // hides its own brightness. A cell's own offset is pl - rl, so nothing
      // needs storing per cell for this.
      quiet.push(dys[i]);
    }
  }
  const baseDy = cells.length && quiet.length ? median(quiet) : medDy;
  const cellsOutside = pc.length - cellsInRegion;
  const darkOut = cellsOutside ? darkOutside / cellsOutside : 0;
  return { cells, cellsInRegion, baseDy, medDy, darkOut };
}

// Reduce a diffed cell set to the per-patch decision values. frac, the color
// samples and the centroid all come from cells inside the decision region.
function finishPatch(cells, cellsInRegion, baseDy) {
  const inside = cells.filter((c) => c.inRegion);
  let sumX = 0, sumY = 0, sumLift = 0;
  for (const c of inside) { sumX += c.px; sumY += c.py; sumLift += c.pl - c.rl; }
  // Centroid of the fired cells, relative to the patch center. Comparing
  // centroids of neighbouring patches in board coordinates tells one shared
  // blob apart from two separate tiles.
  const centroid = inside.length
    ? [sumX / inside.length, sumY / inside.length]
    : [0, 0];
  return {
    frac: cellsInRegion ? inside.length / cellsInRegion : 0,
    masked: inside.map((c) => c.c),
    // Brightness the fired cells carry over the board around them.
    lift: inside.length ? sumLift / inside.length - baseDy : 0,
    centroid,
  };
}

// The full per-patch classification used in production: mask the diff, split
// it into connected components, drop glare blobs, and express the centroid
// (and each kept component's centroid) relative to the CALIBRATED point by
// folding in the local alignment shift. Every coordinate a consumer sees
// from here on uses that one convention.
export function classifyAlignedPatch(pc, rc, gain, shift, inRegion) {
  const { cells, cellsInRegion, baseDy, medDy, darkOut } =
    maskPatch(pc, rc, gain, inRegion);
  const comps = splitComponents(cells).filter((c) => !isGlare(c));
  const r = finishPatch(comps.flatMap((c) => c.cells), cellsInRegion, baseDy);
  const fold = ([x, y]) => [x + shift[0], y + shift[1]];
  return {
    ...r,
    shift,
    // Share of the board around the region this patch finds in shadow.
    darkOut,
    // How far this patch's luma sits from the empty-board reference. Only
    // meaningful next to the same figure from the rest of the scan, which is
    // why decideLink takes the scan's median rather than judging it here.
    medDy,
    centroid: fold(r.centroid),
    comps: comps.map((c) => ({ ...c, centroid: fold(c.centroid) })),
  };
}

// Glare (a sheen on the glossy board) desaturates a region toward neutral
// white, which fires the chroma mask just like a white tile. The tell: the
// board art stays visible through glare, so the photo's luma still tracks
// the reference's, while a real tile hides the art completely. The same tell
// catches the other thing that fires without a tile: a printed line the
// homography left slightly misplaced, which shows the art displaced rather
// than covered.
//
// The cut has little room. Over six photos the largest blob a real tile
// produced reached 0.468 (a red tile on burtonOnTrent-stone, 85 cells in
// region), and the smallest blob that had to go was 0.548 (displaced print on
// belper-derby, 60 cells). Above this cut that print comes back as a question
// about empty board; below it a real tile is thrown away and the link reads
// empty, which is the worse of the two, so the cut sits nearer the print. Small
// blobs land anywhere in between - fragments of white tiles measured 0.52, 0.60
// and 0.69 - and they are dropped, which costs nothing: at 11 to 28 cells they
// cannot carry a link, and their links still classify without them. Raising
// GLARE_MIN_CELLS to spare them only lets small glare blobs through instead.
export const GLARE_CORR = 0.5;
export const GLARE_MIN_CELLS = 8;
// Above this size the correlation stops being evidence. The test asks whether
// the photo's luma tracks the reference art, which only means anything while
// the component is a blob sitting on board; a component covering most of the
// patch IS mostly board, so it tracks the art whatever fired the diff,
// and the answer comes back "glare" for a tile that is plainly there. Measured
// on two night photos where indoor light shifted the whole patch: real tiles
// made components of 385, 390 and 500 cells at corr 0.58-0.68 and their links
// read empty, which costs points silently. The six day-lit photos never dropped
// a component over 111 cells, so nothing there changes. What keeps the one
// large blob with no tile under it (372 cells of glare haze on belper-leek)
// from becoming an answer is the color and lift gates downstream, which put it
// to review; this cut is not a tile detector and must not be read as one.
// Written as a share of the patch rather than the 250 cells it works out to:
// the whole argument is about how much of the patch a component covers, so it
// has to follow PATCH_HALF and CELL rather than silently mean something else
// when either changes.
export const GLARE_MAX_CELLS = 0.4 * (2 * PATCH_HALF / CELL) ** 2;

export const isGlare = (comp) =>
  comp.cells.length >= GLARE_MIN_CELLS &&
  comp.cells.length <= GLARE_MAX_CELLS &&
  comp.corr >= GLARE_CORR;

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

// Distance from plain neutral, the axis every "has this any color left" test
// here is measured on: NEUTRAL_MAX_DIST for colorless, WASHOUT_MAX_DIST for a
// reading too pale to trust inside a reflection.
const neutralDist = ([u, v]) => Math.hypot(u - NEUTRAL_UV[0], v - NEUTRAL_UV[1]);

// A patch is washed out when its own luma offset runs far above the scan's.
// Written so a missing measurement cannot make the answer worse: with nothing
// to compare, no veto.
const washedOut = (medDy, scanLift) =>
  Number.isFinite(medDy) &&
  Number.isFinite(scanLift) &&
  medDy - scanLift > WASHOUT_MIN_LIFT;

// Is something casting a shadow on the board beside this band? Restricted to
// the night side, where the evidence is: patches with a tile on them read
// darkOut 0.222 there against 0.143 for empty board, while on the day side the
// two sit at 0.183 and 0.167 with nothing between them. Dropping the
// restriction costs four questions across the day-face photos and buys nothing.
//
// Worth being plain about what that restriction is. `side` is which face of
// the board is up, not what was lighting it, and the two are only correlated
// here because both photos taken under indoor light happen to be of the night
// face. What the shadow really needs is a light source with a direction. So if
// a day-face board is ever photographed under a lamp, this will sit out the
// scan that needs it most - and the third night-face photo, which is daylit,
// runs it for nothing. That one costs no questions as it stands, which is why
// the proxy is left alone; the day-face measurement above is the thing that
// would have to change first.
//
// Same shape as washedOut: no measurement, no veto.
const shadowed = (darkOut, side) =>
  side === "night" &&
  Number.isFinite(darkOut) &&
  darkOut > SHADOW_MAX_DARK_OUT;

// Three-way decision for one link from its sample-point results.
// state: "auto" (trusted) or "review" (ask the human). color: class or null.
// chromaOffset: per-scan color adaptation [du, dv], estimated from the
// scan's confident detections and subtracted from every blob's chroma so a
// camera or lighting tint measured on one color corrects the others too.
export function decideLink({
  results,
  allowed,
  side,
  chromaOffset = [0, 0],
  scanLift,
}) {
  const bestIndex = strongestIndex(results);
  const { frac, masked, centroid, shift, lift, medDy, darkOut } =
    results[bestIndex];
  if (frac < DETECT_MIN_FRAC) {
    // No lift: with nothing detected there is no blob to have measured one on,
    // and a zero here would read as a measurement.
    //
    // The shadow veto at the end is not consulted here either, though it is
    // measured off board the diff never scores and would survive the empty
    // reading. A tile broad enough to shade the board beside it leaves
    // something in the band: the three tiles that veto exists for read frac
    // 0.20 to 0.28, well over this floor. Shadow with nothing at all under it
    // is the warp instead - pushing the empty night reference through an 8px
    // displacement field produced exactly that on four links, and asking about
    // them was the whole cost.
    return { state: "auto", color: null, frac, bestIndex, centroid, shift };
  }
  const mean = masked
    .reduce((a, c) => a.map((v, k) => v + c[k]), [0, 0, 0])
    .map((v) => v / masked.length);
  const uvRaw = chroma(mean);
  const uv = [uvRaw[0] - chromaOffset[0], uvRaw[1] - chromaOffset[1]];
  const { best, bestD, margin } = nearestProto(uv, side, allowed);
  const near = bestD <= PROTO_MAX_DIST ? best : null;
  // Some blobs have no color to be identified by. The residue of a printed
  // line the warp left a few px off averages to plain neutral, and so does the
  // white token: white is not really a chromaticity class, it sits 0.010 from
  // neutral where the others are ~0.05 apart. Push the empty-board reference
  // through a displacement field a real photo could plausibly leave and links
  // start reporting white tiles on board that is provably empty. Neither the
  // glare test nor the per-cell chroma share separates the two: displaced
  // edges are anti-correlated with the art, same as a pale tile over dark art,
  // and a white token is chromatically weak by definition.
  //
  // So judge those blobs on the axis that does identify white, brightness over
  // the board around them, and only those: a colored tile's brightness runs
  // either way depending on the art it covers, so nothing can be demanded of
  // it. A colorless blob is a white token when the session has one and it is
  // bright enough to be opaque, and otherwise it is nothing at all - never
  // some other color, which is why this reads as a veto and not as a second
  // opinion. Written so a result with no lift measured cannot pass either.
  const colorless = near === "white" || neutralDist(uv) <= NEUTRAL_MAX_DIST;
  // Colorless and not bright: print, and named so the branch below does not
  // turn round and ask about the very thing this just identified. Spelled as a
  // failure to be bright rather than as dimness so a result with no lift
  // measured at all cannot pass.
  const bright = lift >= NEUTRAL_MIN_LIFT;
  // Reading it as print holds only while the blob is the size print comes in.
  // Indoor light at night washes a tile's color out and brightens the board
  // around it at the same time, so lift stays low and a real tile lands here -
  // and this branch answered empty on tiles covering half the band, silently,
  // which costs points with nothing on screen to catch it. Real tiles lost that
  // way measured frac 0.47 to 0.56; displaced print and fold ghosts never
  // passed 0.30 on board that was provably empty, stress_warp included. Over
  // the cut the blob is not print, so it falls through to the question below.
  const residue = colorless && !bright && frac < RESIDUE_MAX_FRAC;
  const color = !colorless ? near : near === "white" && bright ? "white" : null;
  let state = "auto";
  if (color === null) {
    // Not any session color: glare or a foreign object. Ask only when it is
    // both large and vaguely tile-colored; far-off chroma (a blue window
    // reflection) is never a tile, whatever its size, and neither is print the
    // warp displaced, however much of the band it covers.
    if (
      !residue &&
      frac >= UNMATCHED_EMPTY_MAX_FRAC &&
      bestD < UNMATCHED_REVIEW_MAX_DIST
    ) {
      state = "review";
    }
  } else if (
    frac < AUTO_MIN_FRAC ||
    bestD > AUTO_MAX_DIST ||
    margin < AUTO_MIN_MARGIN[side]
  ) {
    state = "review";
  } else if (washedOut(medDy, scanLift) && neutralDist(uv) < WASHOUT_MAX_DIST) {
    // Indoor light at night lays a bright patch over one corner of the board,
    // and inside it a tile's chroma slides toward neutral until it lands on
    // whichever color sits nearest neutral - measured on a red tile answered
    // pink and a yellow one answered white, both with margin to spare, because
    // every gate above is a distance to a prototype and none of them knows the
    // reading came from a region where color is gone. So the region has to be
    // recognised instead: its patches read far brighter against the empty board
    // than the rest of the scan does. Inside one, only a reading with real
    // saturation left is worth answering on; a pale one is asked about whatever
    // it matched, and however well. This cannot recover the tile's color, only
    // decline to guess it.
    state = "review";
  }
  if (state === "auto" && color === null && shadowed(darkOut, side)) {
    // A tile lying on the board shades the board beside it, and at night that
    // shadow outlives everything else about the tile: indoor light takes the
    // color and the brightness together, and three tiles came back as empty
    // links in silence, which is the one failure nothing downstream catches.
    // So this sits after every branch above rather than inside one: whichever
    // of them was about to answer "nothing here", a shadow next to the band
    // overrules it and the player is asked. It can only say that something is
    // there, never what, so like the washed-out veto it refuses an answer and
    // never supplies one.
    state = "review";
  }
  return {
    state, color, frac, lift, dist: bestD, margin, bestIndex, centroid, shift,
    uv: uvRaw,
  };
}

// A link's color decision and the evidence behind it, cleared. Callers that
// overrule decideLink (a link that cannot exist this era) spread this over
// its result, so the fields that back a color are listed in one place, next
// to the code that fills them.
export const NO_COLOR = {
  color: null,
  dist: undefined,
  margin: undefined,
  uv: undefined,
};

// The luma offset a patch in this scan carries when nothing is reflecting off
// it. Sits here rather than in the pipeline because it is the reference half of
// the WASHOUT_MIN_LIFT comparison, and both halves have to be the same median.
// A plain median over every patch is the point: a reflection covers a corner of
// the board, so the middle of the distribution is board without one. Should a
// reflection ever cover most of the board there is no unlit rest to compare
// against, and no gate here can help.
export function estimateScanLift(patchResults) {
  const dys = Object.values(patchResults)
    .flat()
    .map((r) => r.medDy)
    .filter(Number.isFinite);
  return dys.length ? median(dys) : undefined;
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
