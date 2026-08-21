// Shared shape of a published link-scoring result, stored at
// games/{gameId}/linkScore/{era}: { links, icons, at }. Only what other
// devices need to re-render the totals — the photo never leaves the scanning
// device. The scanner publishes links/at wholesale; icon counts and
// corrections are written per path from the shared score screen, so
// concurrent edits by different players merge instead of clobbering.

import { LINKS_BY_ID } from "./boardData";

// The scanner's linkId -> class|null assignments as the stored links map.
// Firebase cannot store null values, so empty links are dropped.
export function linksFromAssignments(assignments) {
  const links = {};
  for (const [linkId, cls] of Object.entries(assignments)) {
    if (cls) links[linkId] = cls;
  }
  return links;
}

// Back to the [{ linkId, player }] shape scoring.js consumes. Firebase drops
// empty objects entirely, so links/icons may be missing from a stored payload.
// The database rules validate the stored colors but not the link-id keys, so
// an id that is not on the board is skipped instead of crashing the screen.
export function ownedLinksFromPayload(payload) {
  return Object.entries((payload && payload.links) || {})
    .filter(([linkId]) => LINKS_BY_ID[linkId])
    .map(([linkId, player]) => ({ linkId, player }));
}
