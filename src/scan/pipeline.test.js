// classifyAllLinks on a board we build here rather than photograph. The rules
// this pins - what an era-invalid link may answer, and that untouched board
// answers empty - are otherwise only checked by scripts/reference-tools, which
// needs photos of the real board and so cannot run in CI.
import { LINKS } from "../boardData";
import {
  CANONICAL_SIZE as S,
  DETECT_MIN_FRAC,
  PROTOS,
  TILE_R,
  cellGrid,
  samplePointsPx,
} from "./classifier";
import { classifyAllLinks, setRefPatches } from "./pipeline";

// A board with two kinds of detail on it, both of which the scanner needs.
// The slow waves give alignPatch something to lock onto - on a flat board it
// would settle anywhere and every patch would be read cells off where it
// belongs. The dark lines stand in for printed routes: they are what a warp
// leaves a visible residue of, and answering that residue with a tile is the
// failure the warped test below exists to catch.
function makeBoard() {
  const data = new Uint8ClampedArray(S * S * 4);
  const wave = (n, period, amp, mid) => mid + amp * Math.sin(n / period);
  const rx = [], gy = [], bxy = [];
  for (let n = 0; n < S; n++) {
    rx[n] = wave(n, 37, 35, 120);
    gy[n] = wave(n, 53, 30, 130);
  }
  for (let n = 0; n < 2 * S; n++) bxy[n] = wave(n, 71, 25, 110);
  const printed = (x, y) => x % 64 < 3 || y % 53 < 3 || (x + y) % 91 < 3;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (printed(x, y)) {
        data[i] = data[i + 1] = data[i + 2] = 45;
      } else {
        data[i] = rx[x];
        data[i + 1] = gy[y];
        data[i + 2] = bxy[x + y];
      }
      data[i + 3] = 255;
    }
  }
  return { data, width: S, height: S };
}

// A token of one of the session colors, as a tile-sized disc. The
// chromaticity is the prototype's, so a correctly read tile lands on its color
// with no margin to spare for the test to be lucky about.
function paintTile(img, [cx, cy], color) {
  const radius = TILE_R;
  const [u, v] = PROTOS.day[color];
  const sum = 600;
  const rgb = [u * sum, v * sum, (1 - u - v) * sum];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = (y * S + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = rgb[c];
    }
  }
}

const copy = (img) => ({ ...img, data: Uint8ClampedArray.from(img.data) });

// What a folded board leaves behind after the homography: a smooth
// displacement no single translation undoes. Without it a synthetic photo
// matches its reference pixel for pixel, and "empty board reads empty" passes
// however hair-trigger the diff is - measured, by dropping the mask threshold
// from 28 to 4, which this catches and the unwarped board does not.
//
// 4px at 400px is about what a real photo leaves. What it does not reach is
// the rule that keeps displaced print from being read as a pale tile: the
// residue off these few lines stays under DETECT_MIN_FRAC, so nothing gets as
// far as being weighed for brightness. Real board art is dense enough to get
// there, and scripts/reference-tools/stress_warp.mjs is what pushes this same
// field through it.
function warp(img) {
  const amp = 4, wavelength = 400;
  const offset = [];
  for (let n = 0; n < S; n++) offset[n] = amp * Math.sin((2 * Math.PI * n) / wavelength);
  const clamp = (n) => Math.min(S - 1, Math.max(0, Math.round(n)));
  const out = { ...img, data: new Uint8ClampedArray(S * S * 4) };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const from = (clamp(y + offset[x]) * S + clamp(x + offset[y])) * 4;
      const to = (y * S + x) * 4;
      for (let c = 0; c < 3; c++) out.data[to + c] = img.data[from + c];
      out.data[to + 3] = 255;
    }
  }
  return out;
}

// The photo is never exposed exactly like the reference.
const dim = (img) => ({
  ...img,
  data: img.data.map((v, i) => (i % 4 === 3 ? v : v * 0.9)),
});
const byId = (results, id) => results.find((r) => r.linkId === id);

// A link of each kind, taken from the shipped board rather than named twice.
const CANAL_ONLY = LINKS.find((l) => l.canal && !l.rail).id;
const RAIL_ONLY = LINKS.find((l) => l.rail && !l.canal).id;

describe("classifyAllLinks", () => {
  let board;

  beforeAll(() => {
    board = makeBoard();
    const patches = {};
    for (const link of LINKS) {
      patches[link.id] = samplePointsPx(link.id).map(([px, py]) =>
        cellGrid(board, px, py)
      );
    }
    setRefPatches({ day: patches });
  });

  const scan = (photo, era = "canal") =>
    classifyAllLinks(photo, { era, allowed: ["yellow", "red"], side: "day" });

  // Named rather than counted, so a failure says which link spoke up.
  const notEmpty = (results, except) =>
    results
      .filter((r) => r.linkId !== except && (r.state !== "auto" || r.color))
      .map((r) => `${r.linkId}: ${r.state} ${r.color} frac ${r.frac.toFixed(2)}`);

  test("board with nothing on it answers every link empty", () => {
    expect(notEmpty(scan(board))).toEqual([]);
  });

  // The same board, photographed: bent a little and exposed a little darker.
  // Inventing a tile out of that residue is the worst thing this scanner can
  // do, worse than missing one, because the player has no reason to look.
  test("board that is empty but warped and dimmed still answers empty", () => {
    expect(notEmpty(scan(dim(warp(board))))).toEqual([]);
  });

  test("a tile on a link of this era is answered without asking", () => {
    const photo = copy(board);
    paintTile(photo, samplePointsPx(CANAL_ONLY)[0], "yellow");
    const results = scan(photo);
    const r = byId(results, CANAL_ONLY);
    expect([r.state, r.color]).toEqual(["auto", "yellow"]);
    // Painting one link must not move any other link off empty.
    expect(notEmpty(results, CANAL_ONLY)).toEqual([]);
  });

  // Nothing can be placed on a link the era does not have, so whatever is read
  // there - a neighbour's tile reaching in, the printed board showing through,
  // something a player parked on a closed link - is answered empty, and no
  // question is put about a stretch of board that cannot hold a tile.
  test("a link this era does not have is answered empty without asking", () => {
    const photo = copy(board);
    paintTile(photo, samplePointsPx(RAIL_ONLY)[0], "yellow");
    const r = byId(scan(photo), RAIL_ONLY);
    // The tile has to have been seen for the answer to mean anything: without
    // this the test also passes when nothing was detected at all.
    expect(r.frac).toBeGreaterThanOrEqual(DETECT_MIN_FRAC);
    expect([r.state, r.color]).toEqual(["auto", null]);
  });
});
