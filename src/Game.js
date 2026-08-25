import React, { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { database, updateGame } from "./firebaseConfig";
import { ref, onValue } from "firebase/database";
import { incomeLevelFromSpace, highestSpaceOfLevel } from "./income";
import {
  PLAYER_COLORS,
  initialPlayer,
  playersByIndex,
  startingRound,
  moneyMovedThisRound,
  incomeMovedThisRound,
} from "./playerDefaults";
import { ERA_LABELS, ERAS } from "./eras";
import { UNDO_ACTIONS } from "./undoActions";
import {
  tappedByOthers,
  withChanges,
  createOwnWrites,
  CHANGE_HOLD_MS,
} from "./playerChanges";
import { TABLE_BANNER_Z, TONE_CLASSES, useLeavingBanner } from "./banners";
import DonateLink from "./DonateLink";
import Loading from "./Loading";
import "bootstrap/dist/css/bootstrap.min.css";

const MAX_PLAYERS = 4;
const MAX_MONEY = 100;
const LOAN_AMOUNT = 30;
const LOAN_INCOME_LEVEL_PENALTY = 3;
const MIN_INCOME_LEVEL = -10;
const UNDO_WINDOW_MS = 8000;
const SCORE_BANNER_MS = 8000;

// A message with its action, shown to everyone at the table.
const Banner = ({ tone, slide, children }) => (
  <div
    className={`table-banner ${slide} d-flex align-items-center justify-content-between gap-3 shadow ${TONE_CLASSES[tone]}`}
  >
    {children}
  </div>
);

// Ending a round reorders the seats, and the new order is only readable from
// the top of the list, so the screen goes back up to it. Only on the device
// that pressed the button: the write reaches everyone, but taking someone
// else's scroll position away from them while they are reading is not ours to
// do.
const scrollToTurnOrder = () => {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
};

// One line of a player card: what the number is, the number, and the controls
// that move it. The three rows are laid out by a grid on the card body rather
// than by anything here, so the labels line up and so do the buttons.
const PlayerRow = ({ label, ariaLabel, value, change, since, children }) => (
  <div className="player-row">
    <div className="label text-secondary">{label}</div>
    {/* Keyed on the moment of the change so a tap arriving while the last one
        is still lit restarts the wash instead of being swallowed by it. */}
    <div
      key={change || "idle"}
      className={`value text-nowrap${change ? " changed" : ""}`}
    >
      {value}
      {/* Zero is not worth printing: a player who has not moved this number
          reads the same with nothing there. */}
      {!!since && (
        <span
          className={`since badge position-absolute top-50 end-0 translate-middle-y ${
            since > 0 ? "up" : "down"
          }`}
        >
          {since > 0 ? `+${since}` : since}
        </span>
      )}
    </div>
    <div className="btn-group" role="group" aria-label={ariaLabel || label}>
      {children}
    </div>
  </div>
);

// The sign belongs in front of the whole amount, not between the symbol and
// the digits: only the income level ever goes below zero.
const poundsOf = (amount) => (amount < 0 ? `-£${-amount}` : `£${amount}`);

const undoIsFresh = (undo) =>
  undo && Date.now() - new Date(undo.at).getTime() < UNDO_WINDOW_MS;

function Game() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [linkScore, setLinkScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [undoInfo, setUndoInfo] = useState(null);
  const [scoreBanner, setScoreBanner] = useState(null); // era string
  // "index:field" -> when somebody else last moved that number.
  const [changes, setChanges] = useState({});
  const prevLinkScore = useRef(undefined); // undefined until first snapshot
  const prevPlayers = useRef(null); // null until the first snapshot
  const prevUndoAt = useRef(undefined);
  // What this device has written and is waiting to see come back. A snapshot
  // carrying our own tap is not news, so it is claimed against this rather
  // than lit up.
  const ourOwnWrites = useRef(null);
  if (!ourOwnWrites.current) ourOwnWrites.current = createOwnWrites();

  useEffect(() => {
    if (!gameId) return undefined;
    const gameRef = ref(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const nextPlayers = data.players ? Object.values(data.players) : [];
        setChanges(
          withChanges(
            tappedByOthers(prevPlayers.current, nextPlayers, {
              reordered: data.undo?.at !== prevUndoAt.current,
              ours: ourOwnWrites.current,
            })
          )
        );
        prevPlayers.current = nextPlayers;
        prevUndoAt.current = data.undo?.at;
        setPlayers(nextPlayers);
        const nextScore = data.linkScore || null;
        setLinkScore(nextScore);
        // Announce when an era's result is first shared while this screen is
        // open: the node newly appeared and is fresh. Later corrections only
        // rewrite the existing node and stay silent (the score view follows
        // them live). The freshness check keeps a device that joins later,
        // where the node "appears" on the first snapshot, from announcing it.
        const prev = prevLinkScore.current;
        if (prev !== undefined) {
          for (const era of ERAS) {
            const p = nextScore && nextScore[era];
            if (
              p &&
              !(prev && prev[era]) &&
              Date.now() - new Date(p.at).getTime() < SCORE_BANNER_MS
            ) {
              setScoreBanner(era);
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

  // The undo bar shows on every device at the table (the node syncs through
  // the DB), for whatever is left of the window measured from the write time.
  useEffect(() => {
    if (!undoInfo) return undefined;
    const remaining =
      UNDO_WINDOW_MS - (Date.now() - new Date(undoInfo.at).getTime());
    const timer = setTimeout(() => setUndoInfo(null), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [undoInfo]);

  // One timer for the whole set. Any light arriving while it runs replaces the
  // set, which restarts it, so when it does fire every light is equally old
  // and they all go together.
  useEffect(() => {
    if (!Object.keys(changes).length) return undefined;
    const timer = setTimeout(() => setChanges({}), CHANGE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [changes]);

  useEffect(() => {
    if (!scoreBanner) return undefined;
    const timer = setTimeout(() => setScoreBanner(null), SCORE_BANNER_MS);
    return () => clearTimeout(timer);
  }, [scoreBanner]);

  // Each bar outlives its own state for the length of the slide out, so what
  // the strip renders is these rather than the state directly.
  const [shownScore, scoreSlide] = useLeavingBanner(scoreBanner);
  const [shownUndo, undoSlide, dismissUndo] = useLeavingBanner(undoInfo);

  if (loading) {
    return <Loading />;
  }

  // The canal era always comes first, so its result standing in the database
  // is what makes the rail era reachable — no separate "current era" state.
  const scoringEras = linkScore?.canal ? ERAS : ["canal"];

  // Update only the given fields of one player in a single multi-path write
  // so concurrent edits to other players survive.
  const updatePlayer = (index, fields) => {
    const updates = {};
    for (const [key, value] of Object.entries(fields)) {
      const moved = value - players[index][key];
      if (!moved) continue;
      updates[`players/${index}/${key}`] = value;
      // Booked before the write so the snapshot carrying it back — the local
      // echo arrives ahead of the server's — finds it waiting.
      ourOwnWrites.current.book(index, key, moved);
    }
    // A tap that ran into a limit moved nothing, and writing it would fan an
    // identical snapshot out to every device at the table for no reason.
    if (!Object.keys(updates).length) return;
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
      .map((player) =>
        // The marks are laid where the new round starts, which is after the
        // income has been collected rather than before.
        startingRound({
          ...player,
          spent: 0,
          money: Math.max(
            player.money + incomeLevelFromSpace(player.incomePosition),
            0
          ),
        })
      );
    setAllPlayers(nextRound, "endRound");
    scrollToTurnOrder();
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

  return (
    // A phone-width column that becomes two of them on a wide screen. The card
    // itself never grows past a phone's width, since stretching it only drifts
    // the labels away from the buttons that move them.
    <div className="container game-shell">
      <div className="game-heading row align-items-center mb-2 mt-2">
        <div className="col-auto fs-2 pe-0">Game {gameId}</div>
        <div className="col-auto">
          <Link
            to={`/game/${gameId}/invite`}
            className="btn btn-outline-secondary invite"
          >
            Invite
          </Link>
        </div>
      </div>

      {/* One column on a phone, two side by side once there is room for them,
          so a six-seat table is not a scroll from the first seat to the last. */}
      <div className="row row-cols-1 row-cols-lg-2 g-1">
        {players.map((player, index) => (
          <div className="col" key={index}>
            <div className="card h-100">
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
              <div className="card-body player-rows">
                <PlayerRow
                  label="Money"
                  value={poundsOf(player.money)}
                  change={changes[`${index}:money`]}
                  since={moneyMovedThisRound(player)}
                >
                  <button
                    className="btn step btn-outline-secondary"
                    onClick={() => adjustMoney(index, -1)}
                  >
                    −
                  </button>
                  <button
                    className="btn step btn-secondary"
                    onClick={() => adjustMoney(index, 1)}
                  >
                    +
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => loan(index)}
                  >
                    Loan
                  </button>
                </PlayerRow>
                <PlayerRow
                  label="Spent"
                  value={poundsOf(player.spent)}
                  change={changes[`${index}:spent`]}
                >
                  <button
                    className="btn step btn-outline-secondary"
                    onClick={() => adjustSpent(index, -1)}
                  >
                    −
                  </button>
                  <button
                    className="btn step btn-secondary"
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
                </PlayerRow>
                <PlayerRow
                  label="Income"
                  ariaLabel="Income Track"
                  change={changes[`${index}:incomePosition`]}
                  since={incomeMovedThisRound(player)}
                  value={
                    <>
                      {poundsOf(incomeLevelFromSpace(player.incomePosition))}
                      <span className="space ms-2">
                        {player.incomePosition}
                      </span>
                    </>
                  }
                >
                  <button
                    className="btn step btn-outline-secondary"
                    onClick={() => adjustIncomePosition(index, -1)}
                  >
                    −
                  </button>
                  <button
                    className="btn step btn-secondary"
                    onClick={() => adjustIncomePosition(index, 1)}
                  >
                    +
                  </button>
                </PlayerRow>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Everything under the cards stays one column wide, whatever the window
          does: these are read and pressed one at a time. */}
      <div className="game-footer">
        <div className="d-grid gap-2 mb-2 mt-2">
          <button
            className="btn btn-primary btn-lg screen-action"
            onClick={endRound}
          >
            End Round
          </button>
          <div>
            <div className="small text-secondary">Link scoring (β)</div>
            {/* Equal columns whatever the labels are, so the eras read as one
                row of choices rather than two differently sized buttons. */}
            <div
              className="d-grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${scoringEras.length}, 1fr)`,
              }}
            >
              {scoringEras.map((era) => {
                const scored = !!linkScore?.[era];
                return (
                  <button
                    key={era}
                    className="btn btn-outline-primary py-1"
                    onClick={() =>
                      navigate(
                        `/game/${gameId}/${scored ? "score" : "scan"}/${era}`
                      )
                    }
                  >
                    <span className="d-block fw-semibold">
                      {ERA_LABELS[era]}
                    </span>
                    <span className="d-block small text-body-secondary">
                      {scored ? "View & edit" : "Scan the board"}
                    </span>
                  </button>
                );
              })}
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
        <div className="text-center pb-4">
          <Link to="/" className="link-secondary small">
            Home
          </Link>
        </div>
      </div>
      {/* One stack across the top of the screen, so several live bars stack by
          layout instead of each one knowing the others' heights. Fixed, so the
          whole undo window stays reachable from any scroll position, and under
          the connection bar, which owns the same strip. */}
      {(shownScore || shownUndo) && (
        <div className="fixed-top" style={{ zIndex: TABLE_BANNER_Z }}>
          {shownScore && (
            <Banner tone="progress" slide={scoreSlide}>
              <span className="message fw-bold">
                {ERA_LABELS[shownScore]} link points shared
              </span>
              <button
                className="btn btn-light"
                onClick={() => navigate(`/game/${gameId}/score/${shownScore}`)}
              >
                View
              </button>
            </Banner>
          )}
          {shownUndo && (
            <Banner
              tone={UNDO_ACTIONS[shownUndo.action].tone}
              slide={undoSlide}
            >
              <span className="message fw-bold">
                {UNDO_ACTIONS[shownUndo.action].label}
              </span>
              <button
                className="btn btn-light"
                onClick={() => {
                  dismissUndo();
                  performUndo();
                }}
              >
                Undo
              </button>
            </Banner>
          )}
        </div>
      )}
    </div>
  );
}

export default Game;
