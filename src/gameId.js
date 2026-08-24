// A game's whole identity is its id: it is the URL players share, and the only
// key the database rules check. The alphabet and length are pinned by those
// rules ($gameId.matches(/^[a-z0-9]{6}$/)), so base36 digits are not a style
// choice here — anything else makes every write to the game fail silently.
export const randomBase36 = (length) =>
  "x".repeat(length).replace(/x/g, () => ((Math.random() * 36) | 0).toString(36));

export const generateGameId = () => randomBase36(6);
