import { CITIES, MERCHANTS, FARM_BREWERIES, LINKS } from "./boardData";
import { scoreLinksFromIcons } from "./scoring";

describe("boardData", () => {
  const allLocationIds = new Set([
    ...Object.keys(CITIES),
    ...Object.keys(MERCHANTS),
    ...Object.keys(FARM_BREWERIES),
  ]);

  test("has 39 links", () => {
    expect(LINKS).toHaveLength(39);
  });

  test("has 20 cities, 5 merchants, 2 farm breweries", () => {
    expect(Object.keys(CITIES)).toHaveLength(20);
    expect(Object.keys(MERCHANTS)).toHaveLength(5);
    expect(Object.keys(FARM_BREWERIES)).toHaveLength(2);
  });

  test("every link endpoint is a known location", () => {
    for (const link of LINKS) {
      for (const loc of link.locations) {
        expect(allLocationIds.has(loc)).toBe(true);
      }
    }
  });

  test("8 rail-only links; the only canal-only link is Burton-Walsall", () => {
    const railOnly = LINKS.filter((l) => l.rail && !l.canal);
    const canalOnly = LINKS.filter((l) => l.canal && !l.rail);
    expect(railOnly).toHaveLength(8);
    expect(canalOnly).toHaveLength(1);
    expect(canalOnly[0].locations.sort()).toEqual([
      "burtonOnTrent",
      "walsall",
    ]);
  });

  test("Kidderminster-Worcester link is also adjacent to the southern farm brewery", () => {
    const link = LINKS.find(
      (l) =>
        l.locations.includes("kidderminster") &&
        l.locations.includes("worcester")
    );
    expect(link.locations).toContain("farmSouth");
  });

  test("Cannock has a dedicated link to the northern farm brewery", () => {
    const link = LINKS.find((l) => l.locations.includes("farmNorth"));
    expect(link.locations.sort()).toEqual(["cannock", "farmNorth"]);
  });

  test("Uttoxeter is unreachable in the canal era", () => {
    const canalLinks = LINKS.filter((l) => l.canal);
    const touching = canalLinks.filter((l) =>
      l.locations.includes("uttoxeter")
    );
    expect(touching).toHaveLength(0);
  });
});

describe("scoreLinksFromIcons", () => {
  test("uses manual icon counts for cities and fixed 2 for merchants", () => {
    const links = [
      { linkId: "coalbrookdale-shrewsbury", player: "red" },
      { linkId: "walsall-wolverhampton", player: "pink" },
    ];
    const icons = { coalbrookdale: 3, wolverhampton: 2, walsall: 1 };
    // shrewsbury merchant 2 + coalbrookdale 3 = 5; wolverhampton 2 + walsall 1 = 3
    expect(scoreLinksFromIcons(links, icons)).toEqual({ red: 5, pink: 3 });
  });

  test("missing locations count 0; the farm brewery link counts 3 locations", () => {
    const links = [{ linkId: "kidderminster-worcester", player: "yellow" }];
    const icons = { kidderminster: 1, farmSouth: 2 };
    expect(scoreLinksFromIcons(links, icons)).toEqual({ yellow: 3 });
  });
});
