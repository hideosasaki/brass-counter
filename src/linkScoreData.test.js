import { linksFromAssignments, ownedLinksFromPayload } from "./linkScoreData";

describe("linksFromAssignments", () => {
  it("keeps owned links and drops null assignments", () => {
    expect(
      linksFromAssignments({
        "belper-derby": "red",
        "belper-leek": null,
        "birmingham-coventry": "yellow",
      })
    ).toEqual({
      "belper-derby": "red",
      "birmingham-coventry": "yellow",
    });
  });

  it("returns an empty object when nothing is owned", () => {
    expect(linksFromAssignments({})).toEqual({});
    expect(linksFromAssignments({ "belper-derby": null })).toEqual({});
  });
});

describe("ownedLinksFromPayload", () => {
  it("restores the scoring input shape", () => {
    const payload = {
      links: { "belper-derby": "red", "birmingham-coventry": "yellow" },
      icons: { belper: 2 },
      at: "2026-08-21T12:00:00.000Z",
    };
    expect(ownedLinksFromPayload(payload)).toEqual([
      { linkId: "belper-derby", player: "red" },
      { linkId: "birmingham-coventry", player: "yellow" },
    ]);
  });

  it("treats missing links as empty (Firebase drops empty objects)", () => {
    expect(ownedLinksFromPayload({ at: "2026-08-21T12:00:00.000Z" })).toEqual([]);
    expect(ownedLinksFromPayload(null)).toEqual([]);
  });

  it("drops link ids that are not on the board (rules do not validate keys)", () => {
    expect(
      ownedLinksFromPayload({ links: { "not-a-link": "red", "belper-derby": "red" } })
    ).toEqual([{ linkId: "belper-derby", player: "red" }]);
  });
});
