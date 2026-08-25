import {
  tappedByOthers,
  withChanges,
  createOwnWrites,
  CHANGE_HOLD_MS,
} from "./playerChanges";

const seat = (over = {}) => ({
  color: "#7c69dc",
  money: 17,
  spent: 0,
  incomePosition: 10,
  ...over,
});

const read = (before, after, over = {}) =>
  tappedByOthers(before, after, {
    reordered: false,
    ours: createOwnWrites(),
    ...over,
  });

describe("reading one snapshot against the last", () => {
  test("a number somebody else moved is reported", () => {
    expect(read([seat(), seat()], [seat(), seat({ money: 20 })])).toEqual([
      "1:money",
    ]);
  });

  test("a number nobody moved is not reported", () => {
    expect(read([seat()], [seat()])).toEqual([]);
  });

  test("every tapped field of one player is read, so a loan reports both", () => {
    expect(read([seat()], [seat({ money: 47, incomePosition: 4 })])).toEqual([
      "0:money",
      "0:incomePosition",
    ]);
  });

  test("the first snapshot has nothing to compare against", () => {
    expect(read(null, [seat()])).toBeNull();
  });

  // Every list-wide write leaves its mark on the undo node, which is how a
  // reorder is told apart from a tap.
  test("a reordered list is not compared seat by seat", () => {
    expect(
      read([seat(), seat()], [seat({ money: 30 }), seat()], { reordered: true })
    ).toBeNull();
  });

  test("a list that gained or lost a seat is not compared", () => {
    expect(read([seat()], [seat(), seat()])).toBeNull();
  });
});

describe("claiming this device's own writes", () => {
  const booked = (delta) => {
    const ours = createOwnWrites();
    ours.book(0, "money", delta);
    return ours;
  };

  test("our own tap comes back as news to nobody", () => {
    const ours = booked(1);
    expect(read([seat()], [seat({ money: 18 })], { ours })).toEqual([]);
    expect(ours.claim("0:money", 1)).toBe(0);
  });

  test("a change larger than ours is reported, and settles ours", () => {
    const ours = booked(1);
    expect(read([seat()], [seat({ money: 20 })], { ours })).toEqual([
      "0:money",
    ]);
    expect(ours.claim("0:money", 1)).toBe(0);
  });

  test("a write still in flight keeps waiting for the rest of itself", () => {
    const ours = booked(3);
    expect(read([seat()], [seat({ money: 18 })], { ours })).toEqual([]);
    expect(ours.claim("0:money", 2)).toBe(2);
  });

  // Someone else pulling the other way must not be swallowed by a write of
  // ours that is still outstanding.
  test("a change in the opposite direction is reported, ours intact", () => {
    const ours = booked(1);
    expect(read([seat()], [seat({ money: 15 })], { ours })).toEqual([
      "0:money",
    ]);
    expect(ours.claim("0:money", 1)).toBe(1);
  });

  test("two taps of ours on one number are claimed together", () => {
    const ours = booked(1);
    ours.book(0, "money", 1);
    expect(read([seat()], [seat({ money: 19 })], { ours })).toEqual([]);
    expect(ours.claim("0:money", 1)).toBe(0);
  });

  test("a tap and its correction cancel and leave nothing on the books", () => {
    const ours = booked(1);
    ours.book(0, "money", -1);
    expect(ours.claim("0:money", 1)).toBe(0);
  });

  // A write that never comes back would otherwise sit on the books for the
  // life of the tab and eat somebody else's change at whatever seat later
  // takes that number.
  test("a list-wide write forgets whatever was still outstanding", () => {
    const ours = booked(1);
    expect(read([seat()], [seat(), seat()], { ours })).toBeNull();
    expect(ours.claim("0:money", 1)).toBe(0);
    expect(read([seat()], [seat({ money: 18 })], { ours })).toEqual([
      "0:money",
    ]);
  });
});

describe("lighting what moved", () => {
  test("a number that moved is lit at the moment it did", () => {
    const before = Date.now();
    expect(withChanges(["0:money"])({})["0:money"]).toBeGreaterThanOrEqual(
      before
    );
  });

  test("a tap landing while the light is on pushes it forward", () => {
    const old = Date.now() - CHANGE_HOLD_MS / 2;
    expect(withChanges(["0:money"])({ "0:money": old })["0:money"]).toBeGreaterThan(
      old
    );
  });

  test("nothing having moved leaves the lights untouched", () => {
    const standing = { "0:money": Date.now() };
    expect(withChanges([])(standing)).toBe(standing);
  });

  // A round ending puts every light out, but only when some are on: handing
  // back a fresh empty object every snapshot would re-render for nothing.
  test("a list-wide write puts every light out", () => {
    expect(withChanges(null)({ "0:money": Date.now() })).toEqual({});
  });

  test("nothing lit and nothing to compare leaves the same object", () => {
    const dark = {};
    expect(withChanges(null)(dark)).toBe(dark);
  });
});
