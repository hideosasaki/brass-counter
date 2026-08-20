// End-of-era scoring for Brass: Birmingham.
//
// Link scoring: each of your link tiles scores 1 VP per link icon displayed
// in its adjacent locations (rulebook p.7). Icons are printed on both faces
// of industry tiles, so flipped state does not matter here. Merchant
// locations always show 2 icons.
// Tile scoring: only flipped industry tiles score their printed VP.

import { INDUSTRY_STATS, MERCHANTS, LINKS } from "./boardData";

const LINKS_BY_ID = Object.fromEntries(LINKS.map((l) => [l.id, l]));

export function linkIconsOfTile(industry, level) {
  return INDUSTRY_STATS[industry][level].linkVP;
}

// tiles: [{ location, industry, level, flipped, player, vp? }]
export function locationLinkIcons(locationId, tiles) {
  if (MERCHANTS[locationId]) {
    return MERCHANTS[locationId].linkIcons;
  }
  return tiles
    .filter((t) => t.location === locationId)
    .reduce((sum, t) => sum + linkIconsOfTile(t.industry, t.level), 0);
}

// links: [{ linkId, player }]
// Returns { [player]: total VP }.
export function scoreLinks(links, tiles) {
  const scores = {};
  for (const { linkId, player } of links) {
    const link = LINKS_BY_ID[linkId];
    const vp = link.locations.reduce(
      (sum, loc) => sum + locationLinkIcons(loc, tiles),
      0
    );
    scores[player] = (scores[player] || 0) + vp;
  }
  return scores;
}

// Sum VP of flipped tiles per player. An explicit vp (e.g. read from a
// photo of the tile) takes precedence over the lookup table.
export function scoreFlippedTiles(tiles) {
  const scores = {};
  for (const t of tiles) {
    if (!t.flipped) continue;
    const vp = t.vp !== undefined ? t.vp : INDUSTRY_STATS[t.industry][t.level].vp;
    scores[t.player] = (scores[t.player] || 0) + vp;
  }
  return scores;
}
