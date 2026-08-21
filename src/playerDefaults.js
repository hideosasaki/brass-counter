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

export const initialPlayer = (color) => ({
  color,
  money: 17,
  spent: 0,
  incomePosition: 10,
});

// Firebase stores the player list as an object keyed by index.
export const playersByIndex = (list) =>
  Object.fromEntries(list.map((p, i) => [i, p]));
