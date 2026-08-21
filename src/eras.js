// The game's two eras, in play order, with the labels every screen shows.
// Kept dependency-free so the game screen can name an era without pulling in
// the board data that the scanner and score screen need.
export const ERAS = ["canal", "rail"];

export const ERA_LABELS = { canal: "🛶 Canal", rail: "🚂 Rail" };

// Heading form, e.g. "🛶 Canal era".
export const eraTitle = (era) => `${ERA_LABELS[era]} era`;

export const isEra = (era) => ERAS.includes(era);
