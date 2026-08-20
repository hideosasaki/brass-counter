// Income track of Brass: Birmingham (progress track spaces 0-99).
// The income level is the coin value printed beside the marker's space:
//   spaces  0-10 -> levels -10..0  (1 space per level)
//   spaces 11-30 -> levels   1..10 (2 spaces per level)
//   spaces 31-60 -> levels  11..20 (3 spaces per level)
//   spaces 61-96 -> levels  21..29 (4 spaces per level)
//   spaces 97-99 -> level   30

export function incomeLevelFromSpace(space) {
  if (space <= 10) return space - 10;
  if (space <= 30) return Math.ceil((space - 10) / 2);
  if (space <= 60) return 10 + Math.ceil((space - 30) / 3);
  if (space <= 96) return 20 + Math.ceil((space - 60) / 4);
  return 30;
}

// Highest-numbered space within a level. Taking a loan drops the marker to
// the highest space of (current level - 3), per the rulebook.
export function highestSpaceOfLevel(level) {
  if (level <= 0) return level + 10;
  if (level <= 10) return 10 + 2 * level;
  if (level <= 20) return 30 + 3 * (level - 10);
  if (level <= 29) return 60 + 4 * (level - 20);
  return 99;
}
