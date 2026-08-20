// Starting state of a player (rulebook: £17, income level 0 = space 10).
export const PLAYER_COLORS = ["#7c69dc", "#dbc118", "#c7bcb5", "#ad3d1e"];

export const initialPlayer = (color) => ({
  color,
  money: 17,
  spent: 0,
  incomePosition: 10,
});
