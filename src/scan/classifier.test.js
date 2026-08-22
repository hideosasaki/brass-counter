import {
  CANONICAL_SIZE,
  PROTOS,
  cellGrid,
  fitGain,
  classifyAlignedPatch,
  DISC_REGION,
  decideLink,
  detectedPoint,
  estimateChromaOffset,
  linkSamplePoints,
  parseRefBin,
  alignPatch,
  splitComponents,
  isGlare,
  GLARE_CORR,
  GLARE_MIN_CELLS,
  GLARE_MAX_CELLS,
  NEUTRAL_MIN_LIFT,
  RESIDUE_MAX_FRAC,
  WASHOUT_MIN_LIFT,
  WASHOUT_MAX_DIST,
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

  // The cut is not free to move, and the window is narrow: the numbers below
  // are measured, and the reasoning for landing between them is at the
  // GLARE_CORR comment. Both edges have been crossed in the field - once too
  // high, and a link asked about empty board on every scan; once too low, and a
  // red tile was thrown away and its link read empty.
  //
  // The window has also been shrinking as photos are added, from 0.19 wide to
  // 0.08. If a photo ever closes it, the answer is not a number in the middle:
  // it means one correlation is being asked to separate three populations at
  // once, and displaced print - which is thin, edge-shaped, and sits on a
  // gradient in the reference - needs a test of its own.
  test("the glare cut sits between real tiles and art showing through", () => {
    expect(GLARE_CORR).toBeGreaterThan(0.468); // largest blob a real tile made
    expect(GLARE_CORR).toBeLessThan(0.548); // smallest blob with no tile under it
  });

  test("a small blob is never called glare, whatever its correlation", () => {
    const small = [cell(0, 0, 100, 40), cell(CELL, 0, 120, 60)];
    const [comp] = splitComponents(small);
    expect(isGlare(comp)).toBe(false);
  });

  // A component covering most of the patch is mostly board, so its luma tracks
  // the reference by construction and the correlation says nothing about what
  // fired the diff. Measured: night photos where the whole patch went bright
  // produced 385-500 cell components at corr 0.58-0.68 over real tiles, and
  // those links read empty. The largest component the six day-lit photos ever
  // dropped was 111 cells, so the cut has room either side.
  test("a component spanning most of the patch is judged by size, not corr", () => {
    const wide = [];
    for (let i = 0; i < GLARE_MAX_CELLS + 1; i++) {
      wide.push(cell((i % 25) * CELL, ((i / 25) | 0) * CELL, 100 + i, 40 + i));
    }
    const [comp] = splitComponents(wide);
    expect(comp.cells.length).toBeGreaterThan(GLARE_MAX_CELLS);
    expect(comp.corr).toBeGreaterThan(GLARE_CORR);
    expect(isGlare(comp)).toBe(false);
  });

  test("the size cut clears both measured populations", () => {
    expect(GLARE_MAX_CELLS).toBeGreaterThan(111); // largest day-lit drop
    expect(GLARE_MAX_CELLS).toBeLessThan(385); // smallest real tile lost to it
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

  // Reading a colorless dim blob as print holds only while the blob is the size
  // print residue comes in. Indoor light at night washes a tile's color out
  // while brightening the board around it, so lift stays low and the blob lands
  // here - and it was answered empty, silently, on tiles covering half the
  // band. Measured: real tiles lost this way read frac 0.47 to 0.56, while
  // displaced print and fold ghosts on provably empty board never passed 0.30.
  test("a colorless blob too big to be print is asked about, not answered", () => {
    const colorless = [[150, 148, 150], [152, 150, 151]];
    const call = (frac) =>
      decideLink({ results: [{ frac, masked: colorless, lift: -4 }], allowed: ["white", "pink"], side: "day" });
    expect(call(0.3)).toMatchObject({ color: null, state: "auto" });
    expect(call(RESIDUE_MAX_FRAC + 0.05)).toMatchObject({ color: null, state: "review" });
  });

  test("the residue size cut clears both measured populations", () => {
    expect(RESIDUE_MAX_FRAC).toBeGreaterThan(0.3); // largest blob on empty board
    expect(RESIDUE_MAX_FRAC).toBeLessThan(0.47); // smallest real tile lost to it
  });

  // Indoor light at night puts a bright patch over one corner of the board, and
  // inside it a tile's chroma slides toward neutral until it lands on whichever
  // color sits nearest neutral - measured on a red tile answered pink, and a
  // yellow one answered white. Both were confident. The patch's own brightness
  // against the rest of the scan is what marks the region out; the colors that
  // slide can only be the near-neutral ones, so a saturated answer in the same
  // patch is left alone.
  test("a pale reading in a washed-out patch is asked about", () => {
    const white = [[172, 170, 172], [174, 172, 173]];
    const call = (masked, patchLift, side = "day") =>
      decideLink({
        results: [{ frac: 0.55, masked, lift: 30, medDy: patchLift }],
        allowed: ["white", "pink", "yellow", "red"],
        side,
        scanLift: 0,
      });
    expect(call(white, 0)).toMatchObject({ color: "white", state: "auto" });
    expect(call(white, WASHOUT_MIN_LIFT + 5)).toMatchObject({ color: "white", state: "review" });
    // A reading with saturation left cannot have been produced by washing out,
    // so it keeps its answer in the very same patch.
    const yellow = [[196, 164, 90], [198, 166, 92]];
    expect(call(yellow, WASHOUT_MIN_LIFT + 5)).toMatchObject({ color: "yellow", state: "auto" });
    // Both board sides: the night prototypes sit closer together, and the veto
    // is on the reading rather than on which color it matched, so the same
    // reading has to behave the same way on either.
    expect(call(white, WASHOUT_MIN_LIFT + 5, "night")).toMatchObject({ state: "review" });
    expect(call(yellow, WASHOUT_MIN_LIFT + 5, "night")).toMatchObject({ state: "auto" });
    // An unmeasured patch brightness must not create questions of its own.
    expect(
      decideLink({
        results: [{ frac: 0.55, masked: white, lift: 30 }],
        allowed: ["white", "pink"], side: "day",
      })
    ).toMatchObject({ color: "white", state: "auto" });
  });

  test("the washed-out cuts sit between the measured populations", () => {
    expect(WASHOUT_MIN_LIFT).toBeGreaterThan(44.0); // brightest patch that answered correctly
    expect(WASHOUT_MIN_LIFT).toBeLessThan(48.1); // dimmest patch that answered wrong
    expect(WASHOUT_MAX_DIST).toBeGreaterThan(0.052); // palest reading that answered wrong
    expect(WASHOUT_MAX_DIST).toBeLessThan(0.07); // a real yellow tile's own saturation
  });

  // Something is covering this link, it is roughly the right sort of color for
  // a token, and it is big. Whatever it is, the scanner cannot name it, and a
  // link that large and that colored is not something to answer empty on its
  // own. The far-off chroma of a window reflection is a different case, and
  // stays empty however big it gets.
  test("a large blob near no session color is worth asking about", () => {
    const orange = [[225, 122, 104]];
    const blue = [[90, 120, 200]];
    const ask = decideLink({ results: [{ frac: 0.35, masked: orange }], allowed: ["red", "yellow"], side: "day" });
    expect([ask.state, ask.color]).toEqual(["review", null]);
    const quiet = decideLink({ results: [{ frac: 0.35, masked: blue }], allowed: ["red", "yellow"], side: "day" });
    expect([quiet.state, quiet.color]).toEqual(["auto", null]);
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

describe("estimateChromaOffset", () => {
  const at = (color, [du, dv], over = {}) => ({
    color,
    dist: 0.01,
    frac: 0.5,
    uv: [PROTOS.day[color][0] + du, PROTOS.day[color][1] + dv],
    ...over,
  });

  test("with nothing confident to measure, nothing is corrected", () => {
    expect(estimateChromaOffset([], "day")).toEqual([0, 0]);
    expect(estimateChromaOffset([at("yellow", [0.01, 0], { frac: 0.2 })], "day")).toEqual([0, 0]);
  });

  test("the tint is the mean deviation of the confident detections", () => {
    const [du, dv] = estimateChromaOffset(
      [at("yellow", [0.01, 0.004]), at("red", [0.005, 0.002])],
      "day"
    );
    expect(du).toBeCloseTo(0.0075);
    expect(dv).toBeCloseTo(0.003);
  });

  // A ghost can look chromatically perfect, so only tiles with real mass and a
  // close match are allowed to steer the correction every other link gets.
  test("weak or badly matched detections do not steer it", () => {
    const steered = [
      at("yellow", [0.01, 0]),
      at("red", [0.2, 0.2], { frac: 0.25 }),
      at("red", [0.2, 0.2], { dist: 0.05 }),
      at("red", [0.2, 0.2], { uv: undefined }),
    ];
    expect(estimateChromaOffset(steered, "day")[0]).toBeCloseTo(0.01);
  });

  test("a wild reading cannot drag the whole scan", () => {
    const [du, dv] = estimateChromaOffset([at("yellow", [0.4, 0.3])], "day");
    expect(Math.hypot(du, dv)).toBeCloseTo(0.03);
  });
});

describe("detectedPoint", () => {
  const id = "birmingham-dudley";
  const [nx, ny] = linkSamplePoints(id)[0];

  test("a detection puts the dot on the blob, not on the calibrated point", () => {
    const [x, y] = detectedPoint(id, { frac: 0.4, centroid: [20, -40], shift: [8, 8] });
    expect(x).toBeCloseTo(nx + 20 / CANONICAL_SIZE);
    expect(y).toBeCloseTo(ny - 40 / CANONICAL_SIZE);
  });

  // An empty link still moved with the photo, so its dot follows the local
  // alignment rather than sitting where the board would be if it were flat.
  test("with nothing detected the dot follows the alignment shift", () => {
    const [x, y] = detectedPoint(id, { frac: 0.02, centroid: [20, -40], shift: [8, 8] });
    expect(x).toBeCloseTo(nx + 8 / CANONICAL_SIZE);
    expect(y).toBeCloseTo(ny + 8 / CANONICAL_SIZE);
  });

  test("with no result at all the calibrated point stands", () => {
    expect(detectedPoint(id, null)).toEqual([nx, ny]);
  });

  test("the dot belongs to the sample point that read the tile", () => {
    const many = "birmingham-worcester";
    const pts = linkSamplePoints(many);
    const [x, y] = detectedPoint(many, { frac: 0.4, centroid: [0, 0], bestIndex: 2 });
    expect([x, y]).toEqual(pts[2]);
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
