// The destructive actions that offer an undo, with the label every device
// shows while the window is open. The database rules accept exactly these
// action names, which src/databaseRules.test.js pins.
export const UNDO_LABELS = {
  reset: "Game reset",
  removePlayer: "Player removed",
  endRound: "Round ended",
};
