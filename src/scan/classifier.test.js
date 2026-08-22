import {
  cellGrid,
  fitGain,
  classifyAlignedPatch,
  DISC_REGION,
  decideLink,
  linkSamplePoints,
  parseRefBin,
  alignPatch,
  splitComponents,
  isGlare,
  GLARE_CORR,
  GLARE_MIN_CELLS,
  NEUTRAL_MIN_LIFT,
  PATCH_HALF,
  CELL,
  ALIGN_MARGIN,
} from "./classifier";
import { LINKS } from "../boardData";

// Build a synthetic RGBA ImageData-like object filled with one color,
// optionally with a colored disc at the center.
function makePatchImage(size, bg, blob) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let c = bg;
      if (blob) {
        const dx = x - size / 2, dy = y - size / 2;
        if (dx * dx + dy * dy < blob.r * blob.r) c = blob.color;
      }
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

const SIZE = PATCH_HALF * 2;
const GRAY = [120, 120, 120];

describe("cellGrid", () => {
  test("produces uniform cells for a uniform image", () => {
    const img = makePatchImage(SIZE, GRAY);
    const cells = cellGrid(img, PATCH_HALF, PATCH_HALF);
    expect(cells).toHaveLength((SIZE / CELL) ** 2);
    for (const c of cells) {
      expect(Math.round(c[0])).toBe(120);
      expect(Math.round(c[2])).toBe(120);
    }
  });
});

describe("alignPatch", () => {
  test("recovers a local misalignment and reports the shift back to the true spot", () => {
    // Deterministic texture so the luma correlation has a unique optimum.
    const size = 2 * (PATCH_HALF + ALIGN_MARGIN) + 64;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = (x * 37) % 256;
        data[i + 1] = (y * 53) % 256;
        data[i + 2] = ((x + y) * 29) % 256;
        data[i + 3] = 255;
      }
    }
    const img = { data, width: size, height: size };
    const cx = size / 2, cy = size / 2;
    const ref = cellGrid(img, cx, cy, PATCH_HALF);
    // Sample as if the calibrated point were off by (+16, -8) px.
    const off = [16, -8];
    const large = cellGrid(img, cx + off[0], cy + off[1], PATCH_HALF + ALIGN_MARGIN);
    const { cells, shift } = alignPatch(large, ref);
    // The aligned cells match the reference, and sampled-point + shift lands
    // back on the true content position.
    expect(shift).toEqual([-off[0], -off[1]]);
    expect(cells).toEqual(ref);
  });
});

describe("fitGain", () => {
  test("recovers a per-channel gain between photo and reference", () => {
    const photo = cellGrid(makePatchImage(SIZE, [100, 100, 100]), PATCH_HALF, PATCH_HALF);
    const ref = cellGrid(makePatchImage(SIZE, [110, 120, 90]), PATCH_HALF, PATCH_HALF);
    const gain = fitGain([{ pc: photo, rc: ref }]);
    expect(gain[0]).toBeCloseTo(1.1, 1);
    expect(gain[1]).toBeCloseTo(1.2, 1);
    expect(gain[2]).toBeCloseTo(0.9, 1);
  });
});

describe("classifyAlignedPatch", () => {
  test("an empty patch carries the alignment shift as its centroid", () => {
    const pc = cellGrid(makePatchImage(SIZE, GRAY), PATCH_HALF, PATCH_HALF);
    const rc = cellGrid(makePatchImage(SIZE, GRAY), PATCH_HALF, PATCH_HALF);
    const r = classifyAlignedPatch(pc, rc, [1, 1, 1], [16, -8], DISC_REGION);
    expect(r.frac).toBeLessThan(0.02);
    expect(r.centroid).toEqual([16, -8]);
    expect(r.shift).toEqual([16, -8]);
  });

  test("a colored blob keeps its detection and shifted centroid", () => {
    const pc = cellGrid(
      makePatchImage(SIZE, GRAY, { r: 40, color: [220, 180, 50] }),
      PATCH_HALF, PATCH_HALF
    );
    const rc = cellGrid(makePatchImage(SIZE, GRAY), PATCH_HALF, PATCH_HALF);
    const r = classifyAlignedPatch(pc, rc, [1, 1, 1], [8, 8], DISC_REGION);
    expect(r.frac).toBeGreaterThan(0.15);
    expect(r.comps.length).toBeGreaterThan(0);
    const mean = r.masked.reduce((a, c) => a.map((v, k) => v + c[k]), [0, 0, 0])
      .map((v) => v / r.masked.length);
    expect(mean[0]).toBeGreaterThan(mean[2]); // yellow-ish
    // Blob is at the patch center, so the centroid is the shift itself.
    expect(Math.abs(r.centroid[0] - 8)).toBeLessThan(4);
    expect(Math.abs(r.centroid[1] - 8)).toBeLessThan(4);
  });
});

describe("splitComponents", () => {
  const cell = (px, py, pl = 100, rl = 50) => ({
    px, py, c: [pl, pl, pl], pl, rl, inRegion: true,
  });

  test("separates two disconnected blobs", () => {
    const blobA = [cell(0, 0), cell(CELL, 0), cell(0, CELL)];
    const blobB = [cell(10 * CELL, 0), cell(11 * CELL, 0)];
    const comps = splitComponents([...blobA, ...blobB]);
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => c.cells.length).sort()).toEqual([2, 3]);
  });

  test("diagonal neighbours join one component", () => {
    const comps = splitComponents([cell(0, 0), cell(CELL, CELL)]);
    expect(comps).toHaveLength(1);
  });

  test("art showing through is not a tile, however it shows", () => {
    // Glare: photo luma tracks the reference art's luma (brightened).
    const glare = [];
    for (let i = 0; i < GLARE_MIN_CELLS + 2; i++) {
      glare.push(cell(i * CELL, 0, 100 + i * 10, 40 + i * 10));
    }
    const [glareComp] = splitComponents(glare);
    expect(glareComp.corr).toBeGreaterThan(GLARE_CORR);
    expect(isGlare(glareComp)).toBe(true);

    // Displaced print: the homography puts a high-contrast line a cell off, so
    // the art is moved rather than covered. A dark line crossing pale ground,
    // against the same profile one cell along.
    const art = [150, 150, 140, 60, 40, 60, 140, 150, 150, 150];
    const [movedComp] = splitComponents(
      art.slice(1).map((pl, i) => cell(i * CELL, 0, pl, art[i]))
    );
    expect(isGlare(movedComp)).toBe(true);

    // Tile: flat photo luma over varying art.
    const tile = [];
    for (let i = 0; i < GLARE_MIN_CELLS + 2; i++) {
      tile.push(cell(i * CELL, 0, 180 + (i % 2), 40 + i * 10));
    }
    const [tileComp] = splitComponents(tile);
    expect(isGlare(tileComp)).toBe(false);
  });

  // The cut is not free to move; the measured gap it has to land in is at the
  // GLARE_CORR comment. It sat on the far edge of that gap once, which is
  // where a misplaced rail line measured, and one link asked about an empty
  // stretch of board on every scan.
  test("the glare cut sits between real tiles and art showing through", () => {
    expect(GLARE_CORR).toBeGreaterThan(0.36); // strongest real tile blob
    expect(GLARE_CORR).toBeLessThan(0.55); // weakest blob with no tile under it
  });

  test("a small blob is never called glare, whatever its correlation", () => {
    const small = [cell(0, 0, 100, 40), cell(CELL, 0, 120, 60)];
    const [comp] = splitComponents(small);
    expect(isGlare(comp)).toBe(false);
  });
});

describe("decideLink", () => {
  // realistic token color as measured from photos (not fully saturated)
  const yellowMasked = [[174, 159, 125], [168, 155, 120]];
  test("a strong unambiguous detection is auto-assigned", () => {
    const r = decideLink({
      results: [{ frac: 0.4, masked: yellowMasked }],
      allowed: ["pink", "yellow"],
      side: "day",
    });
    expect(r.state).toBe("auto");
    expect(r.color).toBe("yellow");
  });

  test("a borderline detection goes to review", () => {
    const r = decideLink({
      results: [{ frac: 0.13, masked: yellowMasked }],
      allowed: ["pink", "yellow"],
      side: "day",
    });
    expect(r.state).toBe("review");
  });

  test("a very weak detection is dropped as noise, not asked about", () => {
    const r = decideLink({
      results: [{ frac: 0.08, masked: yellowMasked }],
      allowed: ["pink", "yellow"],
      side: "day",
    });
    expect(r.state).toBe("auto");
    expect(r.color).toBe(null);
  });

  test("no detection is an auto empty", () => {
    const r = decideLink({
      results: [{ frac: 0.01, masked: [] }],
      allowed: ["pink", "yellow"],
      side: "day",
    });
    expect(r.state).toBe("auto");
    expect(r.color).toBe(null);
  });

  test("a mask matching no session color is empty, not a color", () => {
    const grayMasked = [[128, 128, 128]];
    const r = decideLink({
      results: [{ frac: 0.2, masked: grayMasked }],
      allowed: ["red", "yellow"],
      side: "day",
    });
    expect(r.color).toBe(null);
  });

  // A blob with no color of its own is either a white token or the residue of
  // print the warp left displaced, and chromaticity cannot tell those apart.
  // Only the brightness over the surrounding board can. The measurement that
  // sent this test here read frac 0.216 with lift -2, on a photo of a board
  // with nothing on it.
  test("a colorless blob is a white token only when it is bright", () => {
    const colorless = [[150, 148, 150], [152, 150, 151]];
    const call = (lift, allowed = ["white", "pink"]) =>
      decideLink({ results: [{ frac: 0.216, masked: colorless, lift }], allowed, side: "day" });
    expect(call(NEUTRAL_MIN_LIFT + 10).color).toBe("white");
    // Dim: empty board, and answered as such rather than asked about.
    expect(call(-2)).toMatchObject({ color: null, state: "auto" });
    // An unmeasured lift must not pass either, or a caller that forgets it
    // gets tiles reported on empty board.
    expect(call(undefined).color).toBe(null);
    // A session without white has pink within reach of plain neutral, and a
    // colorless blob must never come back as some other player's color -
    // brightness is a veto here, not a second opinion.
    expect(call(-2, ["pink", "yellow"])).toMatchObject({ color: null, state: "auto" });
    expect(call(NEUTRAL_MIN_LIFT + 10, ["pink", "yellow"]).color).toBe(null);
  });

  test("multiple sample points take the strongest", () => {
    const r = decideLink({
      results: [{ frac: 0.02, masked: [] }, { frac: 0.4, masked: yellowMasked }],
      allowed: ["yellow"],
      side: "day",
    });
    expect(r.state).toBe("auto");
    expect(r.color).toBe("yellow");
  });
});

describe("linkSamplePoints", () => {
  test("returns at least one point for every link", () => {
    for (const link of LINKS) {
      const pts = linkSamplePoints(link.id);
      expect(pts.length).toBeGreaterThan(0);
      expect(pts[0]).toHaveLength(2);
    }
  });
});

describe("parseRefBin", () => {
  test("round-trips the binary reference format", () => {
    const n = 3;
    const buf = new ArrayBuffer(4 + n * 8 + n * 32);
    const dv = new DataView(buf);
    dv.setUint32(0, n, true);
    dv.setFloat32(4, 12.5, true);
    dv.setFloat32(8, 99.25, true);
    new Uint8Array(buf, 4 + n * 8).fill(7);
    const ref = parseRefBin(buf);
    expect(ref.n).toBe(3);
    expect(ref.pts[0]).toBeCloseTo(12.5);
    expect(ref.pts[1]).toBeCloseTo(99.25);
    expect(ref.desc[0]).toBe(7);
    expect(ref.desc).toHaveLength(n * 32);
  });
});
