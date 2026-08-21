import { LOCATIONS, REGION_COLORS, REGION_ORDER } from "./boardData";

describe("REGION_ORDER", () => {
  // A region missing here would silently rank -1 and sort to the top of the
  // icon-count list instead of with its own color group.
  test("covers every region a location can have", () => {
    const used = [...new Set(Object.values(LOCATIONS).map((l) => l.region))];
    for (const region of used) {
      expect(REGION_ORDER).toContain(region);
    }
  });

  test("lists the same regions as REGION_COLORS", () => {
    expect([...REGION_ORDER].sort()).toEqual(Object.keys(REGION_COLORS).sort());
  });
});
