import {
  CITIES,
  MERCHANTS,
  FARM_BREWERIES,
  LINKS,
  INDUSTRY_STATS,
} from "./boardData";
import {
  linkIconsOfTile,
  locationLinkIcons,
  scoreLinks,
  scoreFlippedTiles,
} from "./scoring";

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

describe("linkIconsOfTile", () => {
  test("breweries show 2 icons at every level", () => {
    for (const level of [1, 2, 3, 4]) {
      expect(linkIconsOfTile("brewery", level)).toBe(2);
    }
  });

  test("coal mines show 2 icons at level 1, then 1", () => {
    expect(linkIconsOfTile("coalMine", 1)).toBe(2);
    expect(linkIconsOfTile("coalMine", 2)).toBe(1);
    expect(linkIconsOfTile("coalMine", 4)).toBe(1);
  });

  test("manufacturers show 0 icons at levels 3 and 7, 2 at levels 1 and 5", () => {
    expect(linkIconsOfTile("manufacturer", 3)).toBe(0);
    expect(linkIconsOfTile("manufacturer", 7)).toBe(0);
    expect(linkIconsOfTile("manufacturer", 1)).toBe(2);
    expect(linkIconsOfTile("manufacturer", 5)).toBe(2);
    expect(linkIconsOfTile("manufacturer", 2)).toBe(1);
  });
});

describe("locationLinkIcons", () => {
  test("merchant locations always count 2, regardless of tiles", () => {
    expect(locationLinkIcons("shrewsbury", [])).toBe(2);
    expect(locationLinkIcons("oxford", [])).toBe(2);
  });

  test("cities sum the icons of built tiles, flipped or not", () => {
    const tiles = [
      { location: "wolverhampton", industry: "manufacturer", level: 2, flipped: false },
      { location: "wolverhampton", industry: "coalMine", level: 1, flipped: true },
    ];
    expect(locationLinkIcons("wolverhampton", tiles)).toBe(3);
  });

  test("a city with no tiles counts 0", () => {
    expect(locationLinkIcons("dudley", [])).toBe(0);
  });
});

describe("scoreLinks", () => {
  test("rulebook p.7 example: Wolverhampton-Walsall link scores 3 VP", () => {
    // Two unflipped level-II manufacturers in Wolverhampton (1 icon each)
    // plus one in Walsall.
    const tiles = [
      { location: "wolverhampton", industry: "manufacturer", level: 2, flipped: false },
      { location: "wolverhampton", industry: "manufacturer", level: 2, flipped: false },
      { location: "walsall", industry: "manufacturer", level: 2, flipped: false },
    ];
    const links = [{ linkId: "walsall-wolverhampton", player: "pink" }];
    expect(scoreLinks(links, tiles)).toEqual({ pink: 3 });
  });

  test("a merchant-adjacent link scores 2 VP even on an empty board", () => {
    const links = [{ linkId: "coalbrookdale-shrewsbury", player: "red" }];
    expect(scoreLinks(links, [])).toEqual({ red: 2 });
  });

  test("Kidderminster-Worcester link also counts the farm brewery", () => {
    const tiles = [
      { location: "farmSouth", industry: "brewery", level: 1, flipped: true },
      { location: "kidderminster", industry: "cottonMill", level: 1, flipped: false },
    ];
    const links = [{ linkId: "kidderminster-worcester", player: "yellow" }];
    // Farm brewery 2 + level-I cotton mill 1 + empty Worcester 0 = 3.
    expect(scoreLinks(links, tiles)).toEqual({ yellow: 3 });
  });

  test("totals are kept per player", () => {
    const links = [
      { linkId: "coalbrookdale-shrewsbury", player: "red" },
      { linkId: "redditch-oxford", player: "yellow" },
      { linkId: "birmingham-oxford", player: "yellow" },
    ];
    expect(scoreLinks(links, [])).toEqual({ red: 2, yellow: 4 });
  });
});

describe("scoreFlippedTiles", () => {
  test("only flipped tiles score", () => {
    const tiles = [
      { location: "coventry", industry: "brewery", level: 3, flipped: true, player: "yellow" },
      { location: "coventry", industry: "pottery", level: 1, flipped: false, player: "yellow" },
    ];
    expect(scoreFlippedTiles(tiles)).toEqual({ yellow: 7 });
  });

  test("an explicit vp (read from a photo) overrides the lookup table", () => {
    const tiles = [
      { location: "dudley", industry: "coalMine", level: 1, flipped: true, player: "red", vp: 1 },
    ];
    expect(scoreFlippedTiles(tiles)).toEqual({ red: 1 });
  });

  test("VP lookup table spot checks", () => {
    expect(INDUSTRY_STATS.pottery[5].vp).toBe(20);
    expect(INDUSTRY_STATS.brewery[4].vp).toBe(10);
  });
});

describe("scoreLinksFromIcons", () => {
  const { scoreLinksFromIcons } = require("./scoring");

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
