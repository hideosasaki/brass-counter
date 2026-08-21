// Presentational pieces shared by the scanner and the published-result view.
// Kept free of the scan pipeline so the result view doesn't pull OpenCV into
// its bundle.
import React from "react";
import { FARM_BREWERIES, LINKS_BY_ID, LOCATIONS, REGION_COLORS } from "./boardData";
import { PLAYER_TOKEN_CLASSES } from "./playerDefaults";

export const CLASS_HEX = Object.fromEntries(
  Object.entries(PLAYER_TOKEN_CLASSES).map(([hex, cls]) => [cls, hex])
);

// Token color classes present in this game, in seat order.
export const sessionClassesOf = (players) =>
  (players || []).map((p) => PLAYER_TOKEN_CLASSES[p.color]).filter(Boolean);

// A class shown as the seat number (#1, #2, …); falls back to the class name
// for a color that no current player uses.
export const playerLabelOf = (players, cls) => {
  const i = (players || []).findIndex((p) => PLAYER_TOKEN_CLASSES[p.color] === cls);
  return i >= 0 ? `#${i + 1}` : cls;
};

export function linkLabel(linkId) {
  const locs = LINKS_BY_ID[linkId].locations.filter((l) => !FARM_BREWERIES[l]);
  return locs.map((l) => LOCATIONS[l].name).join(" – ");
}

// City names as they appear on the board: uppercase on their region-colored
// name banner, so they are easy to find on the physical board.
export function LocationName({ id }) {
  const { bg, fg } = REGION_COLORS[LOCATIONS[id].region];
  return (
    <span
      className="d-inline-block rounded px-2 me-1 mb-1"
      style={{
        backgroundColor: bg,
        color: fg,
        textTransform: "uppercase",
        fontSize: "0.85em",
        letterSpacing: "0.03em",
      }}
    >
      {LOCATIONS[id].name}
    </span>
  );
}

export function LinkName({ linkId }) {
  const locs = LINKS_BY_ID[linkId].locations.filter((l) => !FARM_BREWERIES[l]);
  return (
    <span>
      {locs.map((l, i) => (
        <React.Fragment key={l}>
          {i > 0 && <span className="me-1">–</span>}
          <LocationName id={l} />
        </React.Fragment>
      ))}
    </span>
  );
}
