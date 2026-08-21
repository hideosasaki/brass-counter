import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { database, updateGame } from "./firebaseConfig";
import { ref, onValue } from "firebase/database";
import { incomeLevelFromSpace, highestSpaceOfLevel } from "./income";
import { PLAYER_COLORS, initialPlayer, playersByIndex } from "./playerDefaults";
import { ERA_LABELS, ERAS } from "./eras";
import DonateLink from "./DonateLink";
import "bootstrap/dist/css/bootstrap.min.css";

const MAX_PLAYERS = 4;
const MAX_MONEY = 100;
const LOAN_AMOUNT = 30;
const LOAN_INCOME_LEVEL_PENALTY = 3;
const MIN_INCOME_LEVEL = -10;
const UNDO_WINDOW_MS = 5000;
const SCORE_TOAST_MS = 8000;
const UNDO_LABELS = {
  reset: "Game reset",
  removePlayer: "Player removed",
  endRound: "Round ended",
};

const undoIsFresh = (undo) =>
  undo && Date.now() - new Date(undo.at).getTime() < UNDO_WINDOW_MS;

function Game() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [linkScore, setLinkScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [undoInfo, setUndoInfo] = useState(null);
  const [scoreToast, setScoreToast] = useState(null); // era string
  const prevLinkScore = useRef(undefined); // undefined until first snapshot

  useEffect(() => {
    if (!gameId) return undefined;
    const gameRef = ref(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setPlayers(data.players ? Object.values(data.players) : []);
        const nextScore = data.linkScore || null;
        setLinkScore(nextScore);
        // Toast when an era's result is first shared while this screen is
        // open: the node newly appeared and is fresh. Later corrections only
        // rewrite the existing node and stay silent (the score view follows
        // them live). The freshness check keeps a device that joins later,
        // where the node "appears" on the first snapshot, from toasting.
        const prev = prevLinkScore.current;
        if (prev !== undefined) {
          for (const era of ERAS) {
            const p = nextScore && nextScore[era];
            if (
              p &&
              !(prev && prev[era]) &&
              Date.now() - new Date(p.at).getTime() < SCORE_TOAST_MS
            ) {
              setScoreToast(era);
            }
          }
        }
        prevLinkScore.current = nextScore;
        // Keep the previous reference for an unchanged undo node, so
        // unrelated writes (any money tap) don't re-arm the hide timer.
        setUndoInfo((prev) => {
          const next = undoIsFresh(data.undo) ? data.undo : null;
          return prev?.at === next?.at ? prev : next;
        });
        setLoading(false);
      } else {
        navigate("/");
      }
    });
    return () => unsubscribe();
  }, [gameId, navigate]);

  // The undo toast shows on every device at the table (the node syncs through
  // the DB), for whatever is left of the window measured from the write time.
  useEffect(() => {
    if (!undoInfo) return undefined;
    const remaining =
      UNDO_WINDOW_MS - (Date.now() - new Date(undoInfo.at).getTime());
    const timer = setTimeout(() => setUndoInfo(null), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [undoInfo]);

  useEffect(() => {
    if (!scoreToast) return undefined;
    const timer = setTimeout(() => setScoreToast(null), SCORE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [scoreToast]);

  if (loading) {
    return <div>Loading...</div>;
  }

  // The canal era always comes first, so its result standing in the database
  // is what makes the rail era reachable — no separate "current era" state.
  const scoringEras = linkScore?.canal ? ERAS : ["canal"];

  // Update only the given fields of one player in a single multi-path write
  // so concurrent edits to other players survive.
  const updatePlayer = (index, fields) => {
    const updates = {};
    for (const [key, value] of Object.entries(fields)) {
      updates[`players/${index}/${key}`] = value;
    }
    updateGame(gameId, updates);
  };

  // Replace the whole player list (add/remove/reorder), keyed by index.
  // Destructive actions pass undoAction so every device gets a chance to
  // restore the pre-change snapshot. At most one undo — for the latest such
  // write — exists in the DB; any other list write clears it.
  // extra: additional top-level fields written (and undone) with the change.
  const setAllPlayers = (newPlayers, undoAction, extra = {}, undoExtra = {}) => {
    updateGame(gameId, {
      players: playersByIndex(newPlayers),
      ...extra,
      undo: undoAction
        ? {
            action: undoAction,
            snapshot: playersByIndex(players),
            ...undoExtra,
            at: new Date().toISOString(),
          }
        : null,
    });
  };

  // Whatever top-level fields the destructive write stored next to its
  // snapshot (undoExtra) get written back along with the players.
  const performUndo = () => {
    const { action, snapshot, at, ...extras } = undoInfo;
    setAllPlayers(Object.values(snapshot), undefined, extras);
  };

  const adjustMoney = (index, amount) => {
    const money = Math.max(players[index].money + amount, 0);
    updatePlayer(index, { money });
  };

  const loan = (index) => {
    const player = players[index];
    const level = incomeLevelFromSpace(player.incomePosition);
    if (level - LOAN_INCOME_LEVEL_PENALTY < MIN_INCOME_LEVEL) return;
    updatePlayer(index, {
      money: player.money + LOAN_AMOUNT,
      incomePosition: highestSpaceOfLevel(level - LOAN_INCOME_LEVEL_PENALTY),
    });
  };

  const adjustSpent = (index, amount) => {
    const { money, spent } = players[index];
    if (amount > 0 && money >= amount) {
      updatePlayer(index, { money: money - amount, spent: spent + amount });
    } else if (amount < 0 && spent >= -amount) {
      updatePlayer(index, {
        money: Math.min(money - amount, MAX_MONEY),
        spent: spent + amount,
      });
    }
  };

  const adjustIncomePosition = (index, amount) => {
    const incomePosition = Math.min(
      Math.max(players[index].incomePosition + amount, 0),
      99
    );
    updatePlayer(index, { incomePosition });
  };

  // End of round: collect income and determine the next turn order
  // (ascending money spent, ties keep the current order).
  const endRound = () => {
    const nextRound = [...players]
      .sort((a, b) => a.spent - b.spent)
      .map((player) => ({
        ...player,
        spent: 0,
        money: Math.max(
          player.money + incomeLevelFromSpace(player.incomePosition),
          0
        ),
      }));
    setAllPlayers(nextRound, "endRound");
  };

  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) return;
    const usedColors = players.map((player) => player.color);
    const color = PLAYER_COLORS.find((c) => !usedColors.includes(c));
    setAllPlayers([...players, initialPlayer(color)]);
  };

  const removePlayer = (index) => {
    if (players.length <= 1) return;
    setAllPlayers(players.filter((_, i) => i !== index), "removePlayer");
  };

  // A new game starts without the previous game's link scoring; keep the
  // wiped result in the undo node so undoing the reset restores it too.
  // (Firebase drops null values, so an absent linkScore stores nothing.)
  const resetGame = () => {
    setAllPlayers(
      players.map((player) => initialPlayer(player.color)),
      "reset",
      { linkScore: null },
      { linkScore }
    );
  };

  // Hand the game URL to the other players: the OS share sheet where
  // available (phones), otherwise copy the link to the clipboard. Both APIs
  // need https; on plain http the button does nothing, which is fine for a
  // dev server.
  const shareGame = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `Brass Game ${gameId}`, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  return (
    <div className="container">
      <div className="row align-items-center mb-2 mt-2">
        <div className="col-auto fs-2 pe-0">Game {gameId}</div>
        <div className="col-auto">
          <button
            className="btn p-1 text-secondary"
            aria-label="Share game link"
            onClick={shareGame}
          >
            {copied ? (
              <span className="small">Copied</span>
            ) : (
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {players.map((player, index) => (
        <div className="card mb-1" key={index}>
          <div
            className="card-header fixed-light-surface"
            style={{ backgroundColor: player.color }}
          >
            <div className="fs-2">{`#${index + 1} `}</div>
            {players.length > 1 && (
              <button
                className="btn-close position-absolute top-0 end-0"
                aria-label="Remove Player"
                onClick={() => removePlayer(index)}
              ></button>
            )}
          </div>
          <div className="card-body">
            <div className="row align-items-center mb-2">
              <div className="col-3">Money £</div>
              <div className="col-4 fs-2">{player.money}</div>
              <div className="col d-grid gap-2">
                <div className="btn-group" role="group" aria-label="Money">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => adjustMoney(index, -1)}
                  >
                    -
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => adjustMoney(index, 1)}
                  >
                    +
                  </button>
                  <button className="btn btn-outline-secondary" onClick={() => loan(index)}>
                    Loan
                  </button>
                </div>
              </div>
            </div>
            <div className="row align-items-center mb-2">
              <div className="col-3">Spent £</div>
              <div className="col-4 fs-2">{player.spent}</div>
              <div className="col d-grid gap-2">
                <div className="btn-group" role="group" aria-label="Spent">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => adjustSpent(index, -1)}
                  >
                    -
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => adjustSpent(index, 1)}
                  >
                    +
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => adjustSpent(index, 5)}
                  >
                    +5
                  </button>
                </div>
              </div>
            </div>
            <div className="row align-items-center">
              <div className="col-3">Income Track</div>
              <div className="col-4 fs-2">
                {player.incomePosition} = £
                {incomeLevelFromSpace(player.incomePosition)}
              </div>
              <div className="col d-grid gap-2">
                <div
                  className="btn-group"
                  role="group"
                  aria-label="Income Track"
                >
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => adjustIncomePosition(index, -1)}
                  >
                    -
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => adjustIncomePosition(index, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
      <div className="row align-items-center mb-2 mt-2">
        <div className="col d-grid gap-2">
          <button className="btn btn-primary" onClick={endRound}>
            End Round
          </button>
          <div>
            <div className="small text-secondary">Link scoring (β)</div>
            {/* Equal columns whatever the labels are, so the eras read as one
                row of choices rather than two differently sized buttons. */}
            <div
              className="d-grid gap-2"
              style={{ gridTemplateColumns: `repeat(${scoringEras.length}, 1fr)` }}
            >
              {scoringEras.map((era) => {
                const scored = !!linkScore?.[era];
                return (
                  <button
                    key={era}
                    className="btn btn-outline-primary py-1"
                    onClick={() =>
                      navigate(`/game/${gameId}/${scored ? "score" : "scan"}/${era}`)
                    }
                  >
                    <span className="d-block fw-semibold">{ERA_LABELS[era]}</span>
                    <span className="d-block small text-body-secondary">
                      {scored ? "View & edit" : "Scan the board"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <button className="btn" onClick={resetGame}>
        Reset Game
      </button>
      {players.length < MAX_PLAYERS && (
        <button className="btn float-end" onClick={addPlayer}>
          Add Player
        </button>
      )}
      <div className="clearfix pt-4 pb-3">
        <DonateLink />
      </div>
      {scoreToast && (
        <div
          className="position-fixed start-50 translate-middle-x mb-3 d-flex align-items-center gap-3 px-3 py-2 rounded shadow bg-success text-white"
          style={{ zIndex: 1080, bottom: undoInfo ? 60 : 0 }}
        >
          <span className="fw-bold text-nowrap">
            {ERA_LABELS[scoreToast]} link points shared
          </span>
          <button
            className="btn btn-light"
            onClick={() => navigate(`/game/${gameId}/score/${scoreToast}`)}
          >
            View
          </button>
        </div>
      )}
      {undoInfo && (
        <div
          className="position-fixed bottom-0 start-50 translate-middle-x mb-3 d-flex align-items-center gap-3 px-3 py-2 rounded shadow bg-warning fixed-light-surface"
          style={{ zIndex: 1080 }}
        >
          <span className="fw-bold">{UNDO_LABELS[undoInfo.action]}</span>
          <button className="btn btn-dark" onClick={performUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

export default Game;
