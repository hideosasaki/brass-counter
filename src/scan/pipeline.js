// Browser-side scan pipeline: load OpenCV (WASM) and the reference
// descriptors lazily, rectify a photo into the canonical board frame, and
// classify every link position. Heavy work runs on the main thread with
// yields between stages so progress can render.
import { LINKS, linkInEra } from "../boardData";
import {
  CANONICAL_SIZE,
  parseRefBin,
  linkSamplePoints,
  cellGrid,
  alignPatch,
  fitGain,
  classifyAlignedPatch,
  patchRegion,
  decideLink,
  estimateChromaOffset,
  estimateScanLift,
  NO_COLOR,
  PATCH_HALF,
  ALIGN_MARGIN,
} from "./classifier";
import { loadOpenCV } from "./opencvSource";

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
    ]).then(([cv, day, night]) => {
      // The reference descriptors are immutable; build their WASM Mats once
      // here instead of copying 640KB into a fresh Mat on every scan.
      for (const ref of [day, night]) {
        ref.descMat = cv.matFromArray(ref.n, 32, cv.CV_8U, ref.desc);
      }
      return { cv, refs: { day, night } };
    });
    enginePromise.catch(() => {
      enginePromise = null; // allow retry after a network failure
    });
  }
  return enginePromise;
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

// Decode the photo with jpeg-js, NOT the browser's image pipeline. Phone
// photos are wide-gamut (Display P3); Safari color-converts them when drawing
// to a canvas, but the reference data was built from raw JPEG samples with no
// conversion. Classifying converted pixels against unconverted references
// warps the chroma nonlinearly and creates ghosts, so both sides must read
// the raw samples the same way.
async function fileToImageData(file) {
  const isJpeg =
    file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name || "");
  let raw;
  if (isJpeg) {
    const { default: jpeg } = await import("jpeg-js");
    raw = jpeg.decode(new Uint8Array(await file.arrayBuffer()), {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 512,
    });
  } else {
    // Non-JPEG input (rare): fall back to the browser decoder.
    const bitmap = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const cx = c.getContext("2d");
    cx.drawImage(bitmap, 0, 0);
    raw = cx.getImageData(0, 0, c.width, c.height);
  }
  // ImageData and putImageData below insist on a Uint8ClampedArray, which
  // jpeg-js does not hand back. View the decoded bytes as one instead of
  // copying them: on a 12MP phone photo the copy alone is ~48MB, live at the
  // same moment as the decoded original and the canvas it is drawn into.
  const clamped =
    raw.data instanceof Uint8ClampedArray
      ? raw.data
      : new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.length);
  const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(raw.width, raw.height));
  if (scale === 1) {
    return { data: clamped, width: raw.width, height: raw.height };
  }
  // Downscale via canvases; pixel data in and out of a canvas of the same
  // color space is not color-managed, so the raw samples survive.
  const full = document.createElement("canvas");
  full.width = raw.width;
  full.height = raw.height;
  full
    .getContext("2d")
    .putImageData(new ImageData(clamped, raw.width, raw.height), 0, 0);
  const w = Math.round(raw.width * scale);
  const h = Math.round(raw.height * scale);
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d");
  ctx.drawImage(full, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// era: "canal" | "rail"; allowed: session token classes, e.g. ["pink","yellow"]
// onStage(name): "load" | "detect" | "side" | "warp" | "classify"
export async function scanPhoto(file, { era, allowed, onStage }) {
  onStage("load");
  let [{ cv, refs }, imageData] = await Promise.all([
    ensureEngine(),
    fileToImageData(file),
  ]);

  // OpenCV objects are not garbage collected: the engine's cached reference
  // descriptors outlive the scan and are never registered here, but anything
  // else this function allocates is. own() keeps it until the finally, so no
  // failure path can strand it; free() releases the big ones as soon as they
  // are dead, because the WASM heap never shrinks and a phone has to hold the
  // peak.
  const owned = new Set();
  const own = (m) => {
    owned.add(m);
    return m;
  };
  const free = (m) => {
    owned.delete(m); // delete() is not idempotent in embind
    m.delete();
  };
  try {
    onStage("detect");
    await tick();
    const src = own(cv.matFromImageData(imageData));
    imageData = null; // the pixels live in the WASM heap from here on
    const gray = own(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const orb = own(
      new cv.ORB(ORB_FEATURES, 1.2, 12, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12)
    );
    const kp = own(new cv.KeyPointVector());
    const desc = own(new cv.Mat());
    const noMask = own(new cv.Mat());
    orb.detectAndCompute(gray, noMask, kp, desc);
    free(gray); // ~3MB of full-resolution greyscale, read only by ORB
    free(noMask);

    onStage("side");
    await tick();
    const bf = own(new cv.BFMatcher(cv.NORM_HAMMING, false));
    let best = null;
    for (const side of ["day", "night"]) {
      const ref = refs[side];
      const knn = own(new cv.DMatchVectorVector());
      bf.knnMatch(desc, ref.descMat, knn, 2);
      const good = [];
      for (let i = 0; i < knn.size(); i++) {
        // get(i) hands out a heap-allocated copy of the pair, one per
        // descriptor, so it is freed here rather than registered.
        const pair = knn.get(i);
        if (pair.size() >= 2 && pair.get(0).distance < RATIO * pair.get(1).distance) {
          good.push(pair.get(0)); // DMatch comes back as a plain JS copy
        }
        pair.delete();
      }
      free(knn); // ~1MB of match data per side, all of it read by now
      if (good.length >= 8) {
        const srcPts = own(cv.matFromArray(good.length, 1, cv.CV_32FC2,
          good.flatMap((m) => { const p = kp.get(m.queryIdx).pt; return [p.x, p.y]; })));
        const dstPts = own(cv.matFromArray(good.length, 1, cv.CV_32FC2,
          good.flatMap((m) => [ref.pts[m.trainIdx * 2], ref.pts[m.trainIdx * 2 + 1]])));
        const mask = own(new cv.Mat());
        const H = own(cv.findHomography(srcPts, dstPts, cv.USAC_MAGSAC, 4.0, mask));
        let inliers = 0;
        for (let i = 0; i < mask.rows; i++) inliers += mask.data[i];
        if (!H.empty() && (!best || inliers > best.inliers)) {
          best = { side, inliers, H };
        }
      }
      await tick();
    }
    if (!best || best.inliers < MIN_INLIERS) throw new ScanError("board_not_found");

    onStage("warp");
    await tick();
    const warped = own(new cv.Mat());
    cv.warpPerspective(src, warped, best.H,
      new cv.Size(CANONICAL_SIZE, CANONICAL_SIZE));
    free(src); // 16MB of photo, read for the last time by the warp above
    const canvas = document.createElement("canvas");
    canvas.width = CANONICAL_SIZE;
    canvas.height = CANONICAL_SIZE;
    cv.imshow(canvas, warped);
    free(warped); // another 16MB, now held by the canvas instead

    onStage("classify");
    await tick();
    const warpedData = canvas
      .getContext("2d")
      .getImageData(0, 0, CANONICAL_SIZE, CANONICAL_SIZE);
    const results = classifyAllLinks(warpedData, { era, allowed, side: best.side });

    return { side: best.side, inliers: best.inliers, canvas, links: results };
  } finally {
    for (const m of owned) m.delete();
  }
}

// A tile laid across a junction can reach into two links' bands, and used to
// be caught here and sent to review. That case is a misplacement, which this
// scanner treats as the player's to avoid: recognising a neatly placed board
// is the promise, and questions asked about sloppy ones cost more than they
// buy. The pass is at ddbbcac if a double count ever shows up in a real game.

// Pure of OpenCV: classify all 39 link positions on the canonical frame.
// regionFor is the decision-region policy; the offline harness swaps it to
// score the old disc, or a candidate set of masks, through this same code.
export function classifyAllLinks(
  warpedData,
  { era, allowed, side, regionFor = patchRegion }
) {
  const refPatchStore = getRefPatches(side);
  const pairsById = {};
  for (const link of LINKS) {
    pairsById[link.id] = linkSamplePoints(link.id).map(([nx, ny], i) => {
      const rc = refPatchStore[link.id][i];
      const pcLarge = cellGrid(
        warpedData,
        Math.round(nx * CANONICAL_SIZE),
        Math.round(ny * CANONICAL_SIZE),
        PATCH_HALF + ALIGN_MARGIN
      );
      const { cells, shift } = alignPatch(pcLarge, rc);
      return { pc: cells, rc, shift };
    });
  }
  const gain = fitGain(Object.values(pairsById).flat());
  const patchResults = {};
  for (const link of LINKS) {
    patchResults[link.id] = pairsById[link.id].map(({ pc, rc, shift }, i) =>
      classifyAlignedPatch(pc, rc, gain, shift, regionFor(link.id, i, shift))
    );
  }
  // First pass without adaptation, only to estimate this scan's color tint
  // from its confident detections; then decide everything with the tint
  // corrected. A camera or lighting shift measured on one player's tiles
  // fixes the borderline ones of the other players.
  const firstPass = LINKS.filter((l) => linkInEra(l, era)).map((link) =>
    decideLink({ results: patchResults[link.id], allowed, side })
  );
  const chromaOffset = estimateChromaOffset(firstPass, side);
  // What a patch's luma offset looks like where nothing is reflecting off the
  // board. decideLink compares each patch against this rather than against a
  // fixed number, so an evenly dark or bright photo is not read as glare
  // everywhere.
  const scanLift = estimateScanLift(patchResults);
  return LINKS.map((link) => {
    const eraValid = linkInEra(link, era);
    const r = decideLink({
      results: patchResults[link.id],
      allowed,
      side,
      chromaOffset,
      scanLift,
    });
    // A link this era does not have is always empty, whatever was read there,
    // so it is answered empty and never asked about. The measurement stays
    // because the map screen places its dot from frac/centroid/shift, and
    // cuts the edit card's patch from them.
    if (eraValid) return { linkId: link.id, eraValid, ...r };
    return { linkId: link.id, eraValid, ...r, ...NO_COLOR, state: "auto" };
  });
}

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
