// App player colors and, for each, the physical token color class the
// scanner's classifier recognizes (its PROTOS keys). Kept together so a hex
// tweak cannot silently orphan a player in the scan flow.
export const PLAYER_TOKEN_CLASSES = {
  "#7c69dc": "pink",
  "#dbc118": "yellow",
  "#c7bcb5": "white",
  "#ad3d1e": "red",
};

// Starting state of a player (rulebook: £17, income level 0 = space 10).
export const PLAYER_COLORS = Object.keys(PLAYER_TOKEN_CLASSES);

const START_MONEY = 17;
const START_INCOME_POSITION = 10;

// A round begins where the player is standing. The two marks left here are
// what lets the screen say how far the money and the income have moved since,
// which is the number a table checks when it wants to know that everyone
// entered their turn correctly. Spent needs no mark: it is already measured
// from the start of the round, because ending one puts it back to zero.
export const startingRound = (player) => ({
  ...player,
  roundStartMoney: player.money,
  roundStartIncomePosition: player.incomePosition,
});

export const initialPlayer = (color) =>
  startingRound({
    color,
    money: START_MONEY,
    spent: 0,
    incomePosition: START_INCOME_POSITION,
  });

// How far this player has moved since the round began. A game already in play
// when the marks arrived carries none, and reads as not having moved rather
// than as having moved by everything.
const movedThisRound = (player, field, mark) =>
  player[field] - (player[mark] ?? player[field]);

export const moneyMovedThisRound = (player) =>
  movedThisRound(player, "money", "roundStartMoney");

// In spaces, which is the unit the tiles and the board are counted in, and so
// the one a player checks their turn against.
export const incomeMovedThisRound = (player) =>
  movedThisRound(player, "incomePosition", "roundStartIncomePosition");

// Firebase stores the player list as an object keyed by index.
export const playersByIndex = (list) =>
  Object.fromEntries(list.map((p, i) => [i, p]));
