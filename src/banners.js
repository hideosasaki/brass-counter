// The strip across the top of the screen, and who owns it when two bars want
// it at once: the one saying this device cannot reach the database, and the
// one announcing what just happened at the table. The connection bar wins,
// because a database it cannot reach is also why the other bar's button would
// not work. Both sit on Bootstrap's toast layer, above the sticky totals bar
// at 1020 on purpose: while the app is stuck, why it is stuck matters more
// than the numbers it covers.
export const CONNECTION_BANNER_Z = 1080;
export const TABLE_BANNER_Z = CONNECTION_BANNER_Z - 1;

// What a bar is for, rather than what it looks like. Warning covers both the
// destructive actions and a device losing the database; progress covers the
// game moving forward. Kept out of undoActions.js, which is the set of action
// names the database rules accept and has no business naming a stylesheet.
export const TONE_CLASSES = {
  progress: "bg-success text-white",
  warning: "bg-warning fixed-light-surface",
};
