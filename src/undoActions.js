// The actions that offer an undo, with what every device shows while the
// window is open: the label, and what the bar carrying it is for. Ending a
// round is the game moving forward, so it reads like the other thing this
// screen announces as progress; resetting the game and removing a player
// destroy something, so they read as a warning instead. The database rules
// accept exactly these action names, which src/databaseRules.test.js pins.
export const UNDO_ACTIONS = {
  reset: { label: "Game reset", tone: "warning" },
  removePlayer: { label: "Player removed", tone: "warning" },
  endRound: { label: "Round ended", tone: "progress" },
};
