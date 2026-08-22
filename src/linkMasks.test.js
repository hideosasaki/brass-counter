import { LINKS } from "./boardData";
import { LINK_MASKS } from "./linkMasks";
import {
  CANONICAL_SIZE,
  CENTER_R,
  DISC_REGION,
  MIN_BAND_TILE_FRAC,
  PATCH_HALF,
  distToPoly,
  linkSamplePoints,
  patchCellOffsets,
  patchRegion,
  samplePointsPx,
  worstBandFrac,
} from "./scan/classifier";

describe("LINK_MASKS", () => {
  test("has exactly one mask per link in boardData", () => {
    const linkIds = LINKS.map((l) => l.id).sort();
    expect(Object.keys(LINK_MASKS).sort()).toEqual(linkIds);
  });

  test("every mask is a polyline of normalized points with a usable width", () => {
    for (const mask of Object.values(LINK_MASKS)) {
      expect(mask.pts.length).toBeGreaterThanOrEqual(2);
      expect(mask.width).toBeGreaterThanOrEqual(30);
      // Past ~90px a band starts swallowing the route next to it, which is the
      // ambiguity the masks exist to remove.
      expect(mask.width).toBeLessThanOrEqual(90);
      for (const [x, y] of mask.pts) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(1);
      }
    }
  });

  // A mask only decides anything where it overlaps the patch, and the patch is
  // centred on the link's sample point. Two links once had points sitting over
  // a hundred px off their own route, so their patches never saw the link at
  // all; a mask that barely reaches into the patch is that bug coming back.
  test("each mask covers a usable share of its patch", () => {
    const cells = patchCellOffsets();
    const disc = cells.filter(([x, y]) => DISC_REGION(x, y)).length;
    const thin = [];
    for (const id of Object.keys(LINK_MASKS)) {
      linkSamplePoints(id).forEach((_, i) => {
        const inRegion = patchRegion(id, i, [0, 0]);
        const covered = cells.filter(([x, y]) => inRegion(x, y)).length;
        const pct = Math.round((100 * covered) / disc);
        if (pct < 30) thin.push(`${id}[${i}] covers ${pct}% of the disc`);
      });
    }
    expect(thin).toEqual([]);
  });

  // A patch is centred on its sample point, so the route it is meant to read
  // has to be the nearest one to that point. Where it is not, the patch fills
  // up with the neighbouring link instead, and what that does to the reading
  // is written up at the LINK_POSITIONS header and at maskPatch.
  //
  // The three below are the ones left, each measured rather than waved
  // through. birmingham-tamworth's two points, moved onto its band, hold the
  // same score but read every one of its four observed tiles a little weaker
  // (0.48 -> 0.45 and so on): off the band they sit closer to where tiles
  // land. stokeOnTrent-stone and cannock-walsall carry no tile in any
  // ground-truth photo, so moving them can only be shown not to invent one,
  // never to find one, and the move cost a point of auto-correct. They stay
  // until a game photo uses them. New entries are not allowed: fix the point.
  test("the nearest route to a sample point is its own", () => {
    const known = ["birmingham-tamworth[0]", "cannock-walsall[0]", "stokeOnTrent-stone[0]"];
    const ids = Object.keys(LINK_MASKS);
    const strays = [];
    for (const id of ids) {
      linkSamplePoints(id).forEach(([nx, ny], i) => {
        const x = nx * CANONICAL_SIZE, y = ny * CANONICAL_SIZE;
        const own = distToPoly(x, y, LINK_MASKS[id].pts);
        const stolen = ids.some(
          (other) => other !== id && distToPoly(x, y, LINK_MASKS[other].pts) < own
        );
        if (stolen) strays.push(`${id}[${i}]`);
      });
    }
    expect(strays.sort()).toEqual(known);
  });

  // A patch reaches PATCH_HALF from its point, so a tile out beyond every one
  // of a link's points is never scored and the link reads empty - which is how
  // a yellow tile on birmingham-worcester's long route came back as an empty
  // link. Being inside the reach is not enough either: how much of a tile a
  // patch sees varies about threefold along a band, and a tile read weakly is
  // one the scanner stops to ask about, which for a tile plainly visible in the
  // photo is the failure this whole bound exists to prevent. Both are invisible
  // in cells, so the bound is on the reading itself, at a level that answers
  // rather than asks. Long bands carry several points to hold it;
  // scripts/reference-tools/add_points.mjs places them against this same bound,
  // and band_coverage.mjs shows the margin each link has before it gets here.
  test("a tile anywhere on a band is read by some patch", () => {
    const weak = [];
    for (const [id, mask] of Object.entries(LINK_MASKS)) {
      const { frac } = worstBandFrac(mask, samplePointsPx(id));
      if (frac < MIN_BAND_TILE_FRAC) {
        weak.push(`${id}: worst frac ${frac.toFixed(3)}`);
      }
    }
    expect(weak).toEqual([]);
  });

  // Two links must never score the same board cell. That is weaker than "no
  // tile can reach both" — eighteen pairs of bands run closer together than a
  // tile is wide, which is what pipeline.flagSharedTiles is there for — but it
  // is the part the traced data itself has to get right, and it is checked
  // through the shipped region predicate rather than a copy of the geometry.
  test("no two regions claim the same board cell", () => {
    const cells = patchCellOffsets();
    const anchors = Object.keys(LINK_MASKS).flatMap((id) =>
      samplePointsPx(id).map(([cx, cy], i) => ({
        id,
        i,
        cx,
        cy,
        inRegion: patchRegion(id, i, [0, 0]),
      }))
    );
    const shared = [];
    for (let a = 0; a < anchors.length; a++) {
      for (let b = a + 1; b < anchors.length; b++) {
        const A = anchors[a], B = anchors[b];
        if (A.id === B.id) continue;
        // Patches this far apart cannot hold a cell in common.
        if (Math.abs(A.cx - B.cx) >= 2 * PATCH_HALF) continue;
        if (Math.abs(A.cy - B.cy) >= 2 * PATCH_HALF) continue;
        const both = cells.filter(
          ([px, py]) =>
            A.inRegion(px, py) &&
            B.inRegion(A.cx + px - B.cx, A.cy + py - B.cy)
        ).length;
        if (both) shared.push(`${A.id}[${A.i}] / ${B.id}[${B.i}]: ${both} cells`);
      }
    }
    expect(shared).toEqual([]);
  });

  // Every link is traced today, so nothing in production reaches the fallback.
  // Exercise it anyway: it is what a newly added link scores with until someone
  // traces its route, and an untested path is one that quietly stops working.
  test("a link with no mask falls back to the disc", () => {
    expect(patchRegion("not-a-link", 0, [0, 0])).toBe(DISC_REGION);
    expect(DISC_REGION(0, 0)).toBe(true);
    expect(DISC_REGION(CENTER_R - 1, 0)).toBe(true);
    expect(DISC_REGION(CENTER_R + 1, 0)).toBe(false);
  });
});
