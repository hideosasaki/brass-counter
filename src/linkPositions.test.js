import { LINKS } from "./boardData";
import { LINK_POSITIONS } from "./linkPositions";
import COORDS from "../scripts/reference-tools/coords.json";

describe("LINK_POSITIONS", () => {
  test("has exactly one position per link in boardData", () => {
    const linkIds = LINKS.map((l) => l.id).sort();
    expect(Object.keys(LINK_POSITIONS).sort()).toEqual(linkIds);
  });

  // The offline tools centre every reference patch from their own copy of
  // these points, and the app centres the photo patches from this one. If the
  // two drift, references are compared against the wrong piece of board for
  // every link at once, which is the failure this file's header describes
  // happening to three links by hand.
  test("the offline tools' copy of the points matches", () => {
    expect(COORDS).toEqual(LINK_POSITIONS);
  });

  test("all coordinates are normalized to (0,1)", () => {
    for (const pos of Object.values(LINK_POSITIONS)) {
      const points = Array.isArray(pos[0]) ? pos : [pos];
      for (const [x, y] of points) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(1);
      }
    }
  });
});
