import {
  initialPlayer,
  startingRound,
  moneyMovedThisRound,
  incomeMovedThisRound,
} from "./playerDefaults";

describe("the marks a round starts from", () => {
  test("a new player starts where they stand", () => {
    const player = initialPlayer("#7c69dc");
    expect(moneyMovedThisRound(player)).toBe(0);
    expect(incomeMovedThisRound(player)).toBe(0);
  });

  test("starting a round leaves the marks at the player's current numbers", () => {
    const player = startingRound({
      color: "#7c69dc",
      money: 42,
      spent: 0,
      incomePosition: 21,
    });
    expect(player.roundStartMoney).toBe(42);
    expect(player.roundStartIncomePosition).toBe(21);
  });

  test("what has been spent and earned since is read off the marks", () => {
    const player = { ...initialPlayer("#7c69dc"), money: 5, incomePosition: 17 };
    expect(moneyMovedThisRound(player)).toBe(-12);
    expect(incomeMovedThisRound(player)).toBe(7);
  });

  // Games that were already being played when the marks arrived have none.
  test("a player without marks reads as not having moved", () => {
    const player = { color: "#7c69dc", money: 30, spent: 4, incomePosition: 12 };
    expect(moneyMovedThisRound(player)).toBe(0);
    expect(incomeMovedThisRound(player)).toBe(0);
  });
});
