import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ref, get } from "firebase/database";
import { database } from "../firebaseConfig";
import { CITIES, MERCHANTS, FARM_BREWERIES, LINKS } from "../boardData";
import { scoreLinksFromIcons } from "../scoring";
import { APP_COLOR_CLASS, linkSamplePoints, CANONICAL_SIZE } from "./classifier";
import { ensureEngine, scanPhoto, ScanError } from "./pipeline";
import "bootstrap/dist/css/bootstrap.min.css";

const CLASS_HEX = Object.fromEntries(
  Object.entries(APP_COLOR_CLASS).map(([hex, cls]) => [cls, hex])
);

const LOCATION_NAMES = {
  ...Object.fromEntries(Object.entries(CITIES).map(([id, c]) => [id, c.name])),
  ...Object.fromEntries(Object.entries(MERCHANTS).map(([id, m]) => [id, m.name])),
  ...Object.fromEntries(Object.entries(FARM_BREWERIES).map(([id, f]) => [id, f.name])),
};

const LINKS_BY_ID = Object.fromEntries(LINKS.map((l) => [l.id, l]));

const STAGES = [
  ["load", "Loading recognition engine (first time: ~10MB)"],
  ["detect", "Detecting board features"],
  ["side", "Matching board side"],
  ["warp", "Correcting perspective"],
  ["classify", "Reading link tiles"],
];

function linkLabel(linkId) {
  const locs = LINKS_BY_ID[linkId].locations.filter((l) => !FARM_BREWERIES[l]);
  return locs.map((l) => LOCATION_NAMES[l]).join(" – ");
}

// Where the tile actually sits: the calibrated point, shifted to the
// detected mask centroid when there is a detection. Normalized coords.
function detectedPoint(linkId, result) {
  const pts = linkSamplePoints(linkId);
  if (result && result.frac >= 0.12 && result.centroid) {
    const [nx, ny] = pts[result.bestIndex || 0];
    return [
      nx + result.centroid[0] / CANONICAL_SIZE,
      ny + result.centroid[1] / CANONICAL_SIZE,
    ];
  }
  return pts[0];
}

function patchUrl(canvas, linkId, result) {
  const [nx, ny] = detectedPoint(linkId, result);
  const S = 260;
  const cx = Math.round(nx * CANONICAL_SIZE) - S / 2;
  const cy = Math.round(ny * CANONICAL_SIZE) - S / 2;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  c.getContext("2d").drawImage(canvas, cx, cy, S, S, 0, 0, S, S);
  return c.toDataURL("image/jpeg", 0.85);
}

function Scan() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState(null);
  const [era, setEra] = useState("canal");
  const [phase, setPhase] = useState("setup"); // setup/processing/review/map/icons/result/error
  const [stage, setStage] = useState("load");
  const [error, setError] = useState(null);
  const [scan, setScan] = useState(null); // {canvas, side, links}
  const [assignments, setAssignments] = useState({}); // linkId -> class|null
  const [reviewIds, setReviewIds] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [editingLink, setEditingLink] = useState(null); // from map view
  const [icons, setIcons] = useState({});
  const [boardUrl, setBoardUrl] = useState(null);
  const [debugReport, setDebugReport] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    ensureEngine().catch(() => {});
    get(ref(database, `games/${gameId}/players`)).then((snap) => {
      if (snap.exists()) setPlayers(Object.values(snap.val()));
      else navigate("/");
    });
  }, [gameId, navigate]);

  const sessionClasses = useMemo(
    () => (players || []).map((p) => APP_COLOR_CLASS[p.color]).filter(Boolean),
    [players]
  );

  const playerLabel = (cls) => {
    const i = (players || []).findIndex((p) => APP_COLOR_CLASS[p.color] === cls);
    return i >= 0 ? `#${i + 1}` : cls;
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setPhase("processing");
    setError(null);
    try {
      const result = await scanPhoto(file, {
        era,
        allowed: sessionClasses,
        onStage: setStage,
      });
      const initial = {};
      for (const l of result.links) initial[l.linkId] = l.color;
      setScan(result);
      setAssignments(initial);
      setBoardUrl(result.canvas.toDataURL("image/jpeg", 0.7));
      const queue = result.links.filter((l) => l.state === "review").map((l) => l.linkId);
      setReviewIds(queue);
      setReviewIndex(0);
      setPhase(queue.length ? "review" : "map");
    } catch (err) {
      setError(err instanceof ScanError ? err.code : "failed");
      setPhase("error");
    }
  };

  const assign = (linkId, cls) => {
    setAssignments((a) => ({ ...a, [linkId]: cls }));
    if (editingLink) {
      setEditingLink(null);
    } else if (reviewIndex + 1 < reviewIds.length) {
      setReviewIndex(reviewIndex + 1);
    } else {
      setPhase("map");
    }
  };

  const ownedLinks = useMemo(
    () =>
      Object.entries(assignments)
        .filter(([, cls]) => cls)
        .map(([linkId, cls]) => ({ linkId, player: cls })),
    [assignments]
  );

  const iconLocations = useMemo(() => {
    const set = new Set();
    for (const { linkId } of ownedLinks) {
      for (const loc of LINKS_BY_ID[linkId].locations) {
        if (!MERCHANTS[loc]) set.add(loc);
      }
    }
    return [...set].sort();
  }, [ownedLinks]);

  const totals = useMemo(
    () => scoreLinksFromIcons(ownedLinks, icons),
    [ownedLinks, icons]
  );

  const linkVp = (linkId) =>
    LINKS_BY_ID[linkId].locations.reduce(
      (s, loc) => s + (MERCHANTS[loc] ? MERCHANTS[loc].linkIcons : icons[loc] || 0),
      0
    );

  // One row of color buttons plus Empty: everything must fit on a phone
  // screen together with the patch image, without scrolling.
  const colorButtons = (linkId) => (
    <div className="d-grid gap-2">
      <div className="d-flex gap-2">
        {sessionClasses.map((cls) => (
          <button
            key={cls}
            className="btn btn-lg text-white fw-bold flex-fill"
            style={{ backgroundColor: CLASS_HEX[cls], minHeight: 52 }}
            onClick={() => assign(linkId, cls)}
          >
            {playerLabel(cls)}
          </button>
        ))}
      </div>
      <button
        className="btn btn-lg btn-outline-secondary"
        style={{ minHeight: 48 }}
        onClick={() => assign(linkId, null)}
      >
        Empty
      </button>
    </div>
  );

  if (!players) return <div className="container mt-3">Loading...</div>;

  // ---- setup -------------------------------------------------------------
  if (phase === "setup" || phase === "error") {
    return (
      <div className="container mt-3" style={{ maxWidth: 480 }}>
        <h4>Link scoring</h4>
        {phase === "error" && (
          <div className="alert alert-warning">
            {error === "board_not_found"
              ? "Could not find the board. Retake the photo with the whole board in frame."
              : "Something went wrong. Check your connection and try again."}
          </div>
        )}
        <div className="card mb-3">
          <div className="card-body">
            <div className="mb-2">Which era is ending?</div>
            <div className="btn-group w-100" role="group">
              <button
                className={`btn ${era === "canal" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setEra("canal")}
              >
                Canal
              </button>
              <button
                className={`btn ${era === "rail" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setEra("rail")}
              >
                Rail
              </button>
            </div>
          </div>
        </div>
        <div className="card mb-3">
          <div className="card-body">
            Photograph the whole board in one shot.
            <ul className="mb-0 text-secondary">
              <li>Any angle works, top-down is best</li>
              <li>Good light, no hands over the board</li>
            </ul>
          </div>
        </div>
        <div className="d-grid gap-2">
          <button className="btn btn-primary btn-lg" onClick={() => fileInput.current.click()}>
            Take a photo
          </button>
          <button className="btn btn-outline-secondary" onClick={() => navigate(`/game/${gameId}`)}>
            Back to game
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleFile}
        />
      </div>
    );
  }

  // ---- processing ---------------------------------------------------------
  if (phase === "processing") {
    const reached = STAGES.findIndex(([s]) => s === stage);
    return (
      <div className="container mt-4" style={{ maxWidth: 480 }}>
        <h5 className="mb-3">Reading the board…</h5>
        <ul className="list-group">
          {STAGES.map(([s, label], i) => (
            <li key={s} className="list-group-item d-flex align-items-center gap-2">
              {i < reached ? (
                <span className="text-success">✓</span>
              ) : i === reached ? (
                <span className="spinner-border spinner-border-sm text-primary" />
              ) : (
                <span className="text-secondary">·</span>
              )}
              <span className={i > reached ? "text-secondary" : ""}>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ---- review queue / single edit ------------------------------------------
  const linkResultById = Object.fromEntries(
    (scan ? scan.links : []).map((l) => [l.linkId, l])
  );
  const eraValidById = Object.fromEntries(
    (scan ? scan.links : []).map((l) => [l.linkId, l.eraValid])
  );

  // Shown on review cards during the beta so field reports can tell us why
  // something was flagged.
  const debugLine = (linkId) => {
    const r = linkResultById[linkId];
    if (!r) return null;
    const parts = [`frac ${r.frac.toFixed(2)}`];
    if (r.dist !== undefined) parts.push(`d ${r.dist.toFixed(3)}`);
    if (r.margin !== undefined && r.margin < 1) parts.push(`m ${r.margin.toFixed(3)}`);
    if (r.color) parts.push(`guess ${r.color}`);
    return parts.join(" · ");
  };

  const cardFor = (linkId, heading) => (
    <div className="container mt-3" style={{ maxWidth: 480 }}>
      <h5>{heading}</h5>
      <img
        src={patchUrl(scan.canvas, linkId, linkResultById[linkId])}
        alt={linkLabel(linkId)}
        className="w-100 rounded border mb-2"
        style={{ maxHeight: "40vh", objectFit: "cover" }}
      />
      <div className="fw-bold">{linkLabel(linkId)}</div>
      {eraValidById[linkId] === false ? (
        <div className="alert alert-warning py-2 my-2">
          This link cannot be built in the {era} era. If a tile is shown here,
          it probably belongs to a neighbouring link — choose Empty and assign
          it on the map. Only pick a color if it was really built here.
        </div>
      ) : (
        <div className="text-secondary mb-2">Whose link is this?</div>
      )}
      {colorButtons(linkId)}
      <div className="text-secondary small mt-2">{debugLine(linkId)}</div>
    </div>
  );

  if (phase === "review") {
    const linkId = reviewIds[reviewIndex];
    return cardFor(linkId, `Check ${reviewIndex + 1} / ${reviewIds.length}`);
  }
  if (editingLink) {
    return cardFor(editingLink, "Edit link");
  }

  // ---- map overview ---------------------------------------------------------
  if (phase === "map") {
    return (
      <div className="container mt-3" style={{ maxWidth: 640 }}>
        <h5>Compare with the board</h5>
        <p className="text-secondary">
          Tap a marker to correct it. Dots are empty links.
        </p>
        <div className="position-relative mb-3">
          <img src={boardUrl} alt="board" className="w-100 rounded" />
          {LINKS.map((link) => {
            const [nx, ny] = detectedPoint(link.id, linkResultById[link.id]);
            const cls = assignments[link.id];
            return (
              <button
                key={link.id}
                aria-label={linkLabel(link.id)}
                onClick={() => setEditingLink(link.id)}
                className="position-absolute p-0 border rounded-circle"
                style={{
                  left: `${nx * 100}%`,
                  top: `${ny * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: cls ? 22 : 10,
                  height: cls ? 22 : 10,
                  backgroundColor: cls ? CLASS_HEX[cls] : "rgba(255,255,255,.45)",
                  borderColor: "#fff",
                }}
              />
            );
          })}
        </div>
        <div className="d-grid gap-2">
          <button className="btn btn-primary btn-lg" onClick={() => setPhase("icons")}>
            Next: link icons
          </button>
          <button className="btn btn-outline-secondary" onClick={() => setPhase("setup")}>
            Rescan
          </button>
          <button
            className="btn btn-link text-secondary btn-sm"
            onClick={() => {
              const report = {
                side: scan.side,
                inliers: scan.inliers,
                era,
                allowed: sessionClasses,
                links: scan.links.map(({ linkId, state, color, frac, dist, margin }) => ({
                  linkId, state, color,
                  frac: Number(frac.toFixed(3)),
                  dist: dist !== undefined ? Number(dist.toFixed(3)) : undefined,
                  margin: margin !== undefined && margin < 1 ? Number(margin.toFixed(3)) : undefined,
                })),
              };
              const text = JSON.stringify(report);
              if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard
                  .writeText(text)
                  .then(() => window.alert("Debug report copied"));
              } else {
                // http:// dev server has no clipboard API; show the text
                setDebugReport(text);
              }
            }}
          >
            Copy debug report
          </button>
          {debugReport && (
            <textarea
              readOnly
              className="form-control font-monospace"
              style={{ fontSize: 10, height: 140 }}
              value={debugReport}
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      </div>
    );
  }

  // ---- icon counts ----------------------------------------------------------
  if (phase === "icons") {
    return (
      <div className="container mt-3" style={{ maxWidth: 480 }}>
        <h5>Link icons per location</h5>
        <p className="text-secondary">
          Enter the total of the black hexagon link icons printed on the built
          industry tiles in each location. Merchants always count 2.
        </p>
        {iconLocations.map((loc) => (
          <div key={loc} className="card mb-2">
            <div className="card-body d-flex justify-content-between align-items-center py-2">
              <span>{LOCATION_NAMES[loc]}</span>
              <span className="btn-group">
                <button
                  className="btn btn-dark"
                  onClick={() => setIcons((ic) => ({ ...ic, [loc]: Math.max(0, (ic[loc] || 0) - 1) }))}
                >
                  −
                </button>
                <span className="btn btn-light disabled" style={{ minWidth: 44 }}>
                  {icons[loc] || 0}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => setIcons((ic) => ({ ...ic, [loc]: Math.min(8, (ic[loc] || 0) + 1) }))}
                >
                  +
                </button>
              </span>
            </div>
          </div>
        ))}
        {iconLocations.length === 0 && (
          <div className="alert alert-secondary">No owned links were found.</div>
        )}
        <div className="d-grid gap-2 mt-3">
          <button className="btn btn-primary btn-lg" onClick={() => setPhase("result")}>
            Calculate
          </button>
          <button className="btn btn-outline-secondary" onClick={() => setPhase("map")}>
            Back
          </button>
        </div>
      </div>
    );
  }

  // ---- result ----------------------------------------------------------------
  return (
    <div className="container mt-3" style={{ maxWidth: 480 }}>
      <h4>Link points</h4>
      <table className="table align-middle">
        <tbody>
          {sessionClasses.map((cls) => (
            <tr key={cls}>
              <td style={{ width: 30 }}>
                <span
                  className="d-inline-block rounded"
                  style={{ width: 18, height: 18, backgroundColor: CLASS_HEX[cls] }}
                />
              </td>
              <td>{playerLabel(cls)}</td>
              <td className="text-end fs-4 fw-bold">{totals[cls] || 0} VP</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="mb-3">
        <summary>Per-link breakdown</summary>
        <ul className="list-group mt-2">
          {ownedLinks.map(({ linkId, player }) => (
            <li key={linkId} className="list-group-item d-flex justify-content-between">
              <span>
                <span
                  className="d-inline-block rounded me-2"
                  style={{ width: 12, height: 12, backgroundColor: CLASS_HEX[player] }}
                />
                {linkLabel(linkId)}
              </span>
              <span className="fw-bold">{linkVp(linkId)}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="alert alert-secondary">
        Advance the VP markers on the board and remove the scored link tiles.
      </div>
      <div className="d-grid gap-2">
        <button className="btn btn-primary" onClick={() => navigate(`/game/${gameId}`)}>
          Done
        </button>
        <button className="btn btn-outline-secondary" onClick={() => setPhase("icons")}>
          Back
        </button>
      </div>
    </div>
  );
}

export default Scan;
