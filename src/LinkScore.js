import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database, updateGame } from "./firebaseConfig";
import {
  LINKS,
  linkInEra,
  MERCHANTS,
  LINKS_BY_ID,
  LOCATIONS,
  REGION_COLORS,
  REGION_ORDER,
} from "./boardData";
import { scoreLinksFromIcons, linkVpFromIcons } from "./scoring";
import {
  CLASS_HEX,
  LinkName,
  linkLabel,
  sessionClassesOf,
  playerLabelOf,
} from "./linkDisplay";
import { ownedLinksFromPayload, MAX_LINK_ICONS } from "./linkScoreData";
import { eraTitle } from "./eras";
import DonateLink from "./DonateLink";
import Loading from "./Loading";
import "bootstrap/dist/css/bootstrap.min.css";

// The shared score screen: one live view of a scanned era result that every
// device in the game can read AND edit, like the money counters. Link
// ownership comes from the scan (correctable here), icon counts are entered
// here by anyone at the table. Everything renders from the tiny linkScore
// payload — the scanned photo never leaves the device that took it.
//
// Edits are single-path writes (one link, one location count), so two people
// correcting different things at the same time merge instead of clobbering.
// One location's icon count, on a row wearing that location's region color.
// Both the color and the foreground come from the board data, so a region whose
// name banner is light would still read; see index.css for what the two fixed
// overlays assume.
function IconRow({ loc, count, onStep }) {
  const { name, region } = LOCATIONS[loc];
  const { bg, fg } = REGION_COLORS[region];
  return (
    <div
      className="icon-row d-flex justify-content-between align-items-center rounded mb-2 ps-3 pe-2 py-1"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span className="name text-uppercase small fw-semibold">{name}</span>
      <span className="d-flex align-items-center gap-1">
        <button
          type="button"
          className="btn step"
          aria-label={`One fewer link icon in ${name}`}
          onClick={() => onStep(-1)}
        >
          −
        </button>
        <span className="count text-center fs-5 fw-bold py-1">{count}</span>
        <button
          type="button"
          className="btn step"
          aria-label={`One more link icon in ${name}`}
          onClick={() => onStep(1)}
        >
          +
        </button>
      </span>
    </div>
  );
}

function LinkScore() {
  const { gameId, era } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState(null);
  const [payload, setPayload] = useState(undefined); // undefined until loaded
  const [editingLink, setEditingLink] = useState(null); // expanded row
  const [addingLink, setAddingLink] = useState(""); // <select> choice

  // Two narrow subscriptions instead of the whole game node: unrelated writes
  // (money taps, lastActive bumps) then don't re-render this screen.
  useEffect(() => {
    const offPlayers = onValue(ref(database, `games/${gameId}/players`), (snap) => {
      if (snap.exists()) setPlayers(Object.values(snap.val()));
      else navigate("/");
    });
    const offScore = onValue(ref(database, `games/${gameId}/linkScore/${era}`), (snap) => {
      setPayload(snap.exists() ? snap.val() : null);
    });
    return () => {
      offPlayers();
      offScore();
    };
  }, [gameId, era, navigate]);

  const ownedLinks = useMemo(() => ownedLinksFromPayload(payload), [payload]);
  const icons = useMemo(() => (payload && payload.icons) || {}, [payload]);
  const totals = useMemo(
    () => scoreLinksFromIcons(ownedLinks, icons),
    [ownedLinks, icons]
  );

  const sessionClasses = useMemo(() => sessionClassesOf(players), [players]);
  const playerLabel = (cls) => playerLabelOf(players, cls);

  // Locations whose icon counts matter: adjacent to an owned link, merchants
  // excluded (their 2 icons are printed on the board). Listed in REGION_ORDER,
  // alphabetically within a region.
  const iconLocations = useMemo(() => {
    const set = new Set();
    for (const { linkId } of ownedLinks) {
      for (const loc of LINKS_BY_ID[linkId].locations) {
        if (!MERCHANTS[loc]) set.add(loc);
      }
    }
    const rank = (loc) => REGION_ORDER.indexOf(LOCATIONS[loc].region);
    return [...set].sort(
      (a, b) =>
        rank(a) - rank(b) || LOCATIONS[a].name.localeCompare(LOCATIONS[b].name)
    );
  }, [ownedLinks]);

  // Links that can exist in this era but are not owned yet: candidates for
  // fixing a link the scanner missed (or one someone emptied by mistake).
  const addableLinks = useMemo(
    () =>
      LINKS.filter(
        (l) => linkInEra(l, era) && !ownedLinks.some(({ linkId }) => linkId === l.id)
      ),
    [ownedLinks, era]
  );

  // One field of the payload per write (same merge pattern as Game's
  // updatePlayer), so concurrent edits to different fields don't clobber.
  const write = (path, value) =>
    updateGame(gameId, { [`linkScore/${era}/${path}`]: value });
  const setIconCount = (loc, n) => write(`icons/${loc}`, n);
  const stepIcons = (loc, delta) =>
    setIconCount(
      loc,
      Math.min(MAX_LINK_ICONS, Math.max(0, (icons[loc] || 0) + delta))
    );
  const setOwner = (linkId, cls) => {
    write(`links/${linkId}`, cls); // null deletes = Empty
    setEditingLink(null);
    setAddingLink("");
  };

  const colorButtons = (linkId, withEmpty) => (
    <div className="d-flex gap-2 mt-2">
      {sessionClasses.map((cls) => (
        <button
          key={cls}
          className="btn text-white fw-bold flex-fill"
          style={{ backgroundColor: CLASS_HEX[cls], minHeight: 44 }}
          onClick={() => setOwner(linkId, cls)}
        >
          {playerLabel(cls)}
        </button>
      ))}
      {withEmpty && (
        <button
          className="btn btn-outline-secondary flex-fill"
          style={{ minHeight: 44 }}
          onClick={() => setOwner(linkId, null)}
        >
          Empty
        </button>
      )}
    </div>
  );

  if (!players || payload === undefined)
    return <Loading />;

  if (!payload) {
    return (
      <div className="container mt-3" style={{ maxWidth: 480 }}>
        <h4>Link points</h4>
        <div className="alert alert-secondary">
          No link scoring has been shared for this era yet.
        </div>
        <div className="d-grid">
          <button className="btn btn-outline-secondary" onClick={() => navigate(`/game/${gameId}`)}>
            Back to game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-3" style={{ maxWidth: 480 }}>
      <h4 className="mb-2">
        Link points{" "}
        <small className="text-secondary fs-6">{eraTitle(era)}</small>
      </h4>

      {/* Totals stay visible while icon counts are entered below. */}
      <div
        className="sticky-top bg-body border-bottom d-flex flex-wrap align-items-center gap-3 py-2"
        style={{ zIndex: 1020 }}
      >
        {sessionClasses.map((cls) => (
          <span key={cls} className="d-flex align-items-baseline gap-1">
            <span
              className="d-inline-block rounded align-self-center"
              style={{ width: 16, height: 16, backgroundColor: CLASS_HEX[cls] }}
            />
            <span className="fs-4 fw-bold">{totals[cls] || 0}</span>
            <span className="small text-secondary">VP</span>
          </span>
        ))}
      </div>

      <h6 className="mt-3">Link icons per location</h6>
      <p className="text-secondary small mb-2">
        Enter the total of the black hexagon link icons showing on the built
        industry tiles in each location. Players can count different locations
        at the same time, each on their own device.
      </p>
      {iconLocations.map((loc) => (
        <IconRow
          key={loc}
          loc={loc}
          count={icons[loc] || 0}
          onStep={(delta) => stepIcons(loc, delta)}
        />
      ))}

      <details className="mt-3 mb-3">
        <summary className="h6 mb-2">Links ({ownedLinks.length})</summary>
        <p className="text-secondary small mb-2">Tap a link to correct its owner.</p>
        <ul className="list-group mb-2">
          {ownedLinks.map(({ linkId, player }) => (
            <li key={linkId} className="list-group-item">
              <button
                className="btn p-0 border-0 w-100 d-flex justify-content-between align-items-center text-start"
                onClick={() =>
                  setEditingLink(editingLink === linkId ? null : linkId)
                }
              >
                <span>
                  <span
                    className="d-inline-block rounded me-2"
                    style={{ width: 12, height: 12, backgroundColor: CLASS_HEX[player] }}
                  />
                  <LinkName linkId={linkId} />
                </span>
                <span className="fw-bold">{linkVpFromIcons(linkId, icons)}</span>
              </button>
              {editingLink === linkId && colorButtons(linkId, true)}
            </li>
          ))}
          {ownedLinks.length === 0 && (
            <li className="list-group-item text-secondary">No owned links.</li>
          )}
        </ul>
        <div className="text-secondary small mb-1">Add a missing link</div>
        <select
          className="form-select"
          value={addingLink}
          onChange={(e) => setAddingLink(e.target.value)}
        >
          <option value="">Choose a link…</option>
          {addableLinks.map((l) => (
            <option key={l.id} value={l.id}>
              {linkLabel(l.id)}
            </option>
          ))}
        </select>
        {addingLink && colorButtons(addingLink, false)}
      </details>

      {/* Rescanning needs the link tiles still on the board, so it is offered
          before the instruction to clear them, not after. */}
      <div className="d-grid mb-3">
        <button
          className="btn btn-outline-secondary"
          onClick={() => navigate(`/game/${gameId}/scan/${era}`)}
        >
          Rescan photo
        </button>
      </div>
      {/* The closing step: named as everyone's last action so it does not read
          as something to do while counts are still being entered. */}
      <div className="alert alert-secondary">
        Once everyone has finished counting, advance each player's VP marker by
        their total above, then remove the scored link tiles from the board.
      </div>
      <div className="d-grid">
        <button className="btn btn-primary" onClick={() => navigate(`/game/${gameId}`)}>
          Back to game
        </button>
      </div>
      <div className="mt-4 mb-3">
        <DonateLink />
      </div>
    </div>
  );
}

export default LinkScore;
