// Browser-side scan pipeline: load OpenCV (WASM) and the reference
// descriptors lazily, rectify a photo into the canonical board frame, and
// classify every link position. Heavy work runs on the main thread with
// yields between stages so progress can render.
import { LINKS } from "../boardData";
import {
  CANONICAL_SIZE,
  parseRefBin,
  linkSamplePoints,
  cellGrid,
  fitGain,
  classifyPatch,
  decideLink,
} from "./classifier";

const MAX_PHOTO_DIM = 2000;
const ORB_FEATURES = 20000;
const RATIO = 0.8;
const MIN_INLIERS = 40;

let enginePromise = null;

// Start this as early as possible (e.g. when the scan page mounts): by the
// time the user has taken a photo, the ~10MB WASM is usually cached.
export function ensureEngine() {
  if (!enginePromise) {
    enginePromise = Promise.all([
      loadOpenCV(),
      loadRef("day"),
      loadRef("night"),
      loadRefPatches(),
    ]).then(([cv, day, night]) => ({ cv, refs: { day, night } }));
    enginePromise.catch(() => {
      enginePromise = null; // allow retry after a network failure
    });
  }
  return enginePromise;
}

// opencv.js references Node's fs and cannot go through webpack; it is copied
// into public/scan/ at build time (npm run copy-opencv) and loaded as a
// plain script. The UMD build exposes a promise-like global `cv`.
function loadOpenCV() {
  if (window.cv) return resolveCv(window.cv);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${process.env.PUBLIC_URL}/scan/opencv.js`;
    script.async = true;
    script.onload = () => resolveCv(window.cv).then(resolve, reject);
    script.onerror = () => reject(new Error("failed to load opencv.js"));
    document.head.appendChild(script);
  });
}

async function resolveCv(cv) {
  if (cv && typeof cv.then === "function") return cv;
  if (cv && !cv.Mat) {
    await new Promise((r) => { cv.onRuntimeInitialized = r; });
  }
  return cv;
}

async function loadRef(side) {
  const res = await fetch(`${process.env.PUBLIC_URL}/scan/ref_${side}.bin`);
  if (!res.ok) throw new Error(`failed to load reference (${side})`);
  return parseRefBin(await res.arrayBuffer());
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export class ScanError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // "board_not_found"
  }
}

async function fileToImageData(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// era: "canal" | "rail"; allowed: session token classes, e.g. ["pink","yellow"]
// onStage(name): "load" | "detect" | "side" | "warp" | "classify"
export async function scanPhoto(file, { era, allowed, onStage }) {
  onStage("load");
  const [{ cv, refs }, imageData] = await Promise.all([
    ensureEngine(),
    fileToImageData(file),
  ]);

  onStage("detect");
  await tick();
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  src.delete();
  const orb = new cv.ORB(ORB_FEATURES, 1.2, 12, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  const kp = new cv.KeyPointVector();
  const desc = new cv.Mat();
  orb.detectAndCompute(gray, new cv.Mat(), kp, desc);
  gray.delete();
  orb.delete();

  onStage("side");
  await tick();
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  let best = null;
  for (const side of ["day", "night"]) {
    const ref = refs[side];
    const refDesc = cv.matFromArray(ref.n, 32, cv.CV_8U, Array.from(ref.desc));
    const knn = new cv.DMatchVectorVector();
    bf.knnMatch(desc, refDesc, knn, 2);
    const good = [];
    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);
      if (pair.size() >= 2 && pair.get(0).distance < RATIO * pair.get(1).distance) {
        good.push(pair.get(0));
      }
    }
    knn.delete();
    refDesc.delete();
    if (good.length >= 8) {
      const srcPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
        good.flatMap((m) => { const p = kp.get(m.queryIdx).pt; return [p.x, p.y]; }));
      const dstPts = cv.matFromArray(good.length, 1, cv.CV_32FC2,
        good.flatMap((m) => [ref.pts[m.trainIdx * 2], ref.pts[m.trainIdx * 2 + 1]]));
      const mask = new cv.Mat();
      const H = cv.findHomography(srcPts, dstPts, cv.USAC_MAGSAC, 4.0, mask);
      let inliers = 0;
      for (let i = 0; i < mask.rows; i++) inliers += mask.data[i];
      srcPts.delete(); dstPts.delete(); mask.delete();
      if (!H.empty() && (!best || inliers > best.inliers)) {
        if (best) best.H.delete();
        best = { side, inliers, H };
      } else {
        H.delete();
      }
    }
    await tick();
  }
  kp.delete(); desc.delete(); bf.delete();
  if (!best || best.inliers < MIN_INLIERS) {
    if (best) best.H.delete();
    throw new ScanError("board_not_found");
  }

  onStage("warp");
  await tick();
  const photoMat = cv.matFromImageData(imageData);
  const warped = new cv.Mat();
  cv.warpPerspective(photoMat, warped, best.H,
    new cv.Size(CANONICAL_SIZE, CANONICAL_SIZE));
  photoMat.delete(); best.H.delete();
  const canvas = document.createElement("canvas");
  canvas.width = CANONICAL_SIZE;
  canvas.height = CANONICAL_SIZE;
  cv.imshow(canvas, warped);
  warped.delete();

  onStage("classify");
  await tick();
  const warpedData = canvas
    .getContext("2d")
    .getImageData(0, 0, CANONICAL_SIZE, CANONICAL_SIZE);
  const results = classifyAllLinks(warpedData, { era, allowed, side: best.side });

  return { side: best.side, inliers: best.inliers, canvas, links: results };
}

// Pairs of links whose sample points sit so close together that a tile on
// one can bleed into the other's patch. When both fire, a machine cannot
// tell one-real-plus-crosstalk from two real tiles, so both go to review.
const CLOSE_PAIR_DIST = 0.055; // in normalized board units (~113px at 2048)

export const CLOSE_PAIRS = (() => {
  const pairs = [];
  for (let i = 0; i < LINKS.length; i++) {
    for (let j = i + 1; j < LINKS.length; j++) {
      const a = linkSamplePoints(LINKS[i].id);
      const b = linkSamplePoints(LINKS[j].id);
      const close = a.some(([ax, ay]) =>
        b.some(([bx, by]) => Math.hypot(ax - bx, ay - by) < CLOSE_PAIR_DIST)
      );
      if (close) pairs.push([LINKS[i].id, LINKS[j].id]);
    }
  }
  return pairs;
})();

// Pure of OpenCV: classify all 39 link positions on the canonical frame.
export function classifyAllLinks(warpedData, { era, allowed, side }) {
  const refPatchStore = getRefPatches(side);
  const pairsById = {};
  for (const link of LINKS) {
    pairsById[link.id] = linkSamplePoints(link.id).map(([nx, ny], i) => ({
      pc: cellGrid(
        warpedData,
        Math.round(nx * CANONICAL_SIZE),
        Math.round(ny * CANONICAL_SIZE)
      ),
      rc: refPatchStore[link.id][i],
    }));
  }
  const gain = fitGain(Object.values(pairsById).flat());
  const out = LINKS.map((link) => {
    const eraValid = era === "canal" ? link.canal : link.rail;
    const results = pairsById[link.id].map(({ pc, rc }) =>
      classifyPatch(pc, rc, gain)
    );
    if (!eraValid) {
      // This link cannot exist this era. A strong detection here usually
      // means a neighbouring link's tile drifted -> let the human place it.
      const bestIndex = results.reduce(
        (a, _, i) => (results[i].frac > results[a].frac ? i : a), 0);
      const { frac, centroid } = results[bestIndex];
      return {
        linkId: link.id,
        eraValid,
        state: frac >= 0.12 ? "review" : "auto",
        color: null,
        frac,
        bestIndex,
        centroid,
      };
    }
    return { linkId: link.id, eraValid, ...decideLink({ results, allowed, side }) };
  });
  const byId = Object.fromEntries(out.map((r) => [r.linkId, r]));
  const globalCentroid = (r) => {
    const [nx, ny] = linkSamplePoints(r.linkId)[r.bestIndex || 0];
    return [
      nx * CANONICAL_SIZE + (r.centroid ? r.centroid[0] : 0),
      ny * CANONICAL_SIZE + (r.centroid ? r.centroid[1] : 0),
    ];
  };
  for (const [a, b] of CLOSE_PAIRS) {
    const ra = byId[a], rb = byId[b];
    if (ra.frac >= 0.12 && rb.frac >= 0.12) {
      // Both patches fire. If their mask centroids point at the same spot on
      // the board, it is one tile seen from two patches; a machine cannot
      // decide which link owns it, so both go to review. Two clearly
      // separate blobs are two tiles and stay as decided.
      const [ax, ay] = globalCentroid(ra);
      const [bx, by] = globalCentroid(rb);
      if (Math.hypot(ax - bx, ay - by) < SHARED_BLOB_DIST) {
        for (const r of [ra, rb]) {
          if (r.state === "auto" && r.color) r.state = "review";
        }
      }
    }
  }
  return out;
}

const SHARED_BLOB_DIST = 55; // canonical px between the two mask centroids

// Reference patches (cell grids at every link sample point), computed once
// per side from a small hidden canvas of the reference... but we do not ship
// the reference image. Instead the reference cell grids are precomputed and
// shipped alongside the descriptors.
let refPatchCache = null;

export function setRefPatches(data) {
  refPatchCache = data;
}

function getRefPatches(side) {
  if (!refPatchCache) throw new Error("reference patches not loaded");
  return refPatchCache[side];
}

export async function loadRefPatches() {
  if (refPatchCache) return refPatchCache;
  const res = await fetch(`${process.env.PUBLIC_URL}/scan/ref_patches.json`);
  if (!res.ok) throw new Error("failed to load reference patches");
  refPatchCache = await res.json();
  return refPatchCache;
}
