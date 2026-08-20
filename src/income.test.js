import { incomeLevelFromSpace, highestSpaceOfLevel } from "./income";

describe("incomeLevelFromSpace", () => {
  test("maps track spaces to income levels at the segment boundaries", () => {
    expect(incomeLevelFromSpace(0)).toBe(-10);
    expect(incomeLevelFromSpace(10)).toBe(0);
    expect(incomeLevelFromSpace(11)).toBe(1);
    expect(incomeLevelFromSpace(12)).toBe(1);
    expect(incomeLevelFromSpace(13)).toBe(2);
    expect(incomeLevelFromSpace(30)).toBe(10);
    expect(incomeLevelFromSpace(31)).toBe(11);
    expect(incomeLevelFromSpace(33)).toBe(11);
    expect(incomeLevelFromSpace(60)).toBe(20);
    expect(incomeLevelFromSpace(61)).toBe(21);
    expect(incomeLevelFromSpace(64)).toBe(21);
    expect(incomeLevelFromSpace(96)).toBe(29);
    expect(incomeLevelFromSpace(97)).toBe(30);
    expect(incomeLevelFromSpace(99)).toBe(30);
  });
});

describe("highestSpaceOfLevel", () => {
  test("returns the highest-numbered space of a level (used for loans)", () => {
    expect(highestSpaceOfLevel(-10)).toBe(0);
    expect(highestSpaceOfLevel(0)).toBe(10);
    expect(highestSpaceOfLevel(1)).toBe(12);
    expect(highestSpaceOfLevel(10)).toBe(30);
    expect(highestSpaceOfLevel(20)).toBe(60);
    expect(highestSpaceOfLevel(29)).toBe(96);
    expect(highestSpaceOfLevel(30)).toBe(99);
  });

  test("round-trips with incomeLevelFromSpace", () => {
    for (let level = -10; level <= 30; level++) {
      expect(incomeLevelFromSpace(highestSpaceOfLevel(level))).toBe(level);
    }
  });
});
