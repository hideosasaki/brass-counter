import { LINKS } from "./boardData";
import { LINK_POSITIONS } from "./linkPositions";

describe("LINK_POSITIONS", () => {
  test("has exactly one position per link in boardData", () => {
    const linkIds = LINKS.map((l) => l.id).sort();
    expect(Object.keys(LINK_POSITIONS).sort()).toEqual(linkIds);
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
