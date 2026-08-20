import {
  cellGrid,
  fitGain,
  classifyPatch,
  decideLink,
  linkSamplePoints,
  parseRefBin,
  PATCH_HALF,
  CELL,
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

describe("classifyPatch", () => {
  test("an unchanged patch produces a near-zero mask", () => {
    const pc = cellGrid(makePatchImage(SIZE, GRAY), PATCH_HALF, PATCH_HALF);
    const rc = cellGrid(makePatchImage(SIZE, GRAY), PATCH_HALF, PATCH_HALF);
    const { frac } = classifyPatch(pc, rc, [1, 1, 1]);
    expect(frac).toBeLessThan(0.02);
  });

  test("a colored blob over the reference is masked", () => {
    const pc = cellGrid(
      makePatchImage(SIZE, GRAY, { r: 40, color: [220, 180, 50] }),
      PATCH_HALF, PATCH_HALF
    );
    const rc = cellGrid(makePatchImage(SIZE, GRAY), PATCH_HALF, PATCH_HALF);
    const { frac, masked } = classifyPatch(pc, rc, [1, 1, 1]);
    expect(frac).toBeGreaterThan(0.15);
    const mean = masked.reduce((a, c) => a.map((v, k) => v + c[k]), [0, 0, 0])
      .map((v) => v / masked.length);
    expect(mean[0]).toBeGreaterThan(mean[2]); // yellow-ish
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

  test("a weak detection goes to review", () => {
    const r = decideLink({
      results: [{ frac: 0.08, masked: yellowMasked }],
      allowed: ["pink", "yellow"],
      side: "day",
    });
    expect(r.state).toBe("review");
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
