import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ref, get } from "firebase/database";
import { database, updateGame } from "../firebaseConfig";
import { LINKS } from "../boardData";
import {
  CLASS_HEX,
  LinkName,
  linkLabel,
  sessionClassesOf,
  playerLabelOf,
} from "../linkDisplay";
import { linksFromAssignments } from "../linkScoreData";
import { eraTitle } from "../eras";
import { detectedPoint, CANONICAL_SIZE } from "./classifier";
import { ensureEngine, scanPhoto, ScanError } from "./pipeline";
import "bootstrap/dist/css/bootstrap.min.css";

const STAGES = [
  ["load", "Loading recognition engine"],
  ["detect", "Finding and matching the board"],
  ["warp", "Correcting and reading the board"],
];
// The pipeline reports five stages; the last four pass too quickly to be
// worth separate rows.
const STAGE_ALIAS = { side: "detect", classify: "warp" };

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
  // The era comes from the route: it is chosen on the game screen, by which
  // era button starts this flow, so it is never silently preselected here.
  const { gameId, era } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState(null);
  const [phase, setPhase] = useState("setup"); // setup/processing/review/map
  const [stage, setStage] = useState("load");
  const [error, setError] = useState(null);
  const [scan, setScan] = useState(null); // {canvas, side, links}
  const [assignments, setAssignments] = useState({}); // linkId -> class|null
  const [reviewIndex, setReviewIndex] = useState(0);
  const [editingLink, setEditingLink] = useState(null); // from map view
  const fileInput = useRef(null);
  const libraryInput = useRef(null);

  useEffect(() => {
    ensureEngine().catch(() => {});
    get(ref(database, `games/${gameId}/players`)).then((snap) => {
      if (snap.exists()) setPlayers(Object.values(snap.val()));
      else navigate("/");
    });
  }, [gameId, navigate]);

  // Every step gets its own history entry so the browser back gesture walks
  // back through the flow (previous review card, previous screen) instead of
  // leaving the scanner.
  const applyStep = (s) => {
    setPhase(s.phase);
    setReviewIndex(s.reviewIndex || 0);
    setEditingLink(s.editingLink || null);
  };
  const goTo = (s) => {
    window.history.pushState({ scanStep: s }, "");
    applyStep(s);
  };
  useEffect(() => {
    const onPop = (e) => {
      if (e.state && e.state.scanStep) applyStep(e.state.scanStep);
    };
    window.addEventListener("popstate", onPop);
    window.history.replaceState({ scanStep: { phase: "setup" } }, "");
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const sessionClasses = useMemo(() => sessionClassesOf(players), [players]);
  const playerLabel = (cls) => playerLabelOf(players, cls);

  const linkResultById = useMemo(
    () => Object.fromEntries((scan ? scan.links : []).map((l) => [l.linkId, l])),
    [scan]
  );
  const reviewIds = useMemo(
    () =>
      scan
        ? scan.links.filter((l) => l.state === "review").map((l) => l.linkId)
        : [],
    [scan]
  );
  const boardUrl = useMemo(
    () => scan && scan.canvas.toDataURL("image/jpeg", 0.7),
    [scan]
  );
  // The review/edit card currently on screen; its patch image is cut out and
  // JPEG-encoded once per link, not on every re-render.
  const cardLinkId = phase === "review" ? reviewIds[reviewIndex] : editingLink;
  const cardPatchUrl = useMemo(
    () =>
      scan && cardLinkId
        ? patchUrl(scan.canvas, cardLinkId, linkResultById[cardLinkId])
        : null,
    [scan, cardLinkId, linkResultById]
  );

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
        onStage: (s) => setStage(STAGE_ALIAS[s] || s),
      });
      const initial = {};
      for (const l of result.links) initial[l.linkId] = l.color;
      setScan(result);
      setAssignments(initial);
      const needsReview = result.links.some((l) => l.state === "review");
      goTo(needsReview ? { phase: "review", reviewIndex: 0 } : { phase: "map" });
    } catch (err) {
      setError(err instanceof ScanError ? err.code : "failed");
      setPhase("setup");
    }
  };

  const assign = (linkId, cls) => {
    setAssignments((a) => ({ ...a, [linkId]: cls }));
    if (!editingLink && reviewIndex + 1 < reviewIds.length) {
      goTo({ phase: "review", reviewIndex: reviewIndex + 1 });
    } else {
      goTo({ phase: "map" });
    }
  };

  // Publish the confirmed links (never the photo) and hand over to the shared
  // score screen, where everyone enters icon counts together. Only the links
  // and the share time are written: icon counts already entered by other
  // players survive a re-scan.
  const shareAndOpen = () => {
    updateGame(gameId, {
      [`linkScore/${era}/links`]: linksFromAssignments(assignments),
      [`linkScore/${era}/at`]: new Date().toISOString(),
    });
    navigate(`/game/${gameId}/score/${era}`);
  };

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
  if (phase === "setup") {
    return (
      <div className="container mt-3" style={{ maxWidth: 480 }}>
        <h4>
          Link scoring{" "}
          <small className="text-secondary fs-6">{eraTitle(era)}</small>
        </h4>
        {error && (
          <div className="alert alert-warning">
            {error === "board_not_found"
              ? "Could not find the board. Retake the photo with the whole board in frame."
              : "Something went wrong. Check your connection and try again."}
          </div>
        )}
        <div className="card mb-3">
          <div className="card-body">
            Photograph the whole board in one shot.
            <ul className="mb-2 text-secondary">
              <li>Any angle works, top-down is best</li>
              <li>Good light, no hands over the board</li>
              <li>No lamp reflecting off the tiles: if you see a sheen, move
                until it's gone</li>
            </ul>
            <div className="small text-body-secondary">
              The photo is processed on your device and never uploaded.
            </div>
          </div>
        </div>
        <div className="d-grid gap-2">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => fileInput.current.click()}
          >
            Take a photo
          </button>
          <button
            className="btn btn-outline-primary"
            onClick={() => libraryInput.current.click()}
          >
            Choose from photos
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
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
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
  // Always renders cardLinkId, the link cardPatchUrl was cut for.
  const cardFor = (heading) => {
    const linkId = cardLinkId;
    return (
      <div className="container mt-3" style={{ maxWidth: 480 }}>
        <h5>{heading}</h5>
        <img
          src={cardPatchUrl}
          alt={linkLabel(linkId)}
          className="w-100 rounded border mb-2"
          style={{ maxHeight: "40vh", objectFit: "cover" }}
        />
        <div className="fw-bold fs-5"><LinkName linkId={linkId} /></div>
        {linkResultById[linkId]?.eraValid === false ? (
          <div className="alert alert-warning py-2 my-2">
            This link cannot be built in the {era} era. If a tile is shown here,
            it probably belongs to a neighbouring link — choose Empty and assign
            it on the map. Only pick a color if it was really built here.
          </div>
        ) : (
          <div className="text-secondary mb-2">Whose link is this?</div>
        )}
        {colorButtons(linkId)}
      </div>
    );
  };

  if (phase === "review") {
    return cardFor(`Check ${reviewIndex + 1} / ${reviewIds.length}`);
  }
  if (editingLink) {
    return cardFor("Edit link");
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
                onClick={() => goTo({ phase: "map", editingLink: link.id })}
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
          <button className="btn btn-primary btn-lg" onClick={shareAndOpen}>
            Count the points
          </button>
          <button className="btn btn-outline-secondary" onClick={() => goTo({ phase: "setup" })}>
            Rescan
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default Scan;
