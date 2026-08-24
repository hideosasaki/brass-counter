// End-of-era link scoring for Brass: Birmingham.
//
// Each of your link tiles scores 1 VP per link icon displayed in its adjacent
// locations (rulebook p.7). The icon counts come from the players, who read
// them off the board, so nothing here needs to know what is built where.

import { MERCHANTS, LINKS_BY_ID } from "./boardData";

// One link's VP from manually entered icon counts per location (the
// scanner's v1 flow: link ownership comes from the photo, icon counts from
// the user). Merchants always count their printed 2 icons; unlisted
// locations count 0.
export function linkVpFromIcons(linkId, icons) {
  return LINKS_BY_ID[linkId].locations.reduce(
    (sum, loc) =>
      sum + (MERCHANTS[loc] ? MERCHANTS[loc].linkIcons : icons[loc] || 0),
    0
  );
}

// Returns { [player]: total VP }.
export function scoreLinksFromIcons(links, icons) {
  const scores = {};
  for (const { linkId, player } of links) {
    scores[player] = (scores[player] || 0) + linkVpFromIcons(linkId, icons);
  }
  return scores;
}
