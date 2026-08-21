import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { database } from "./firebaseConfig";
import { ref, onValue, update } from "firebase/database";
import { incomeLevelFromSpace, highestSpaceOfLevel } from "./income";
import { PLAYER_COLORS, initialPlayer } from "./playerDefaults";
import DonateLink from "./DonateLink";
import "bootstrap/dist/css/bootstrap.min.css";

const MAX_PLAYERS = 4;
const MAX_MONEY = 100;
const LOAN_AMOUNT = 30;
const LOAN_INCOME_LEVEL_PENALTY = 3;
const MIN_INCOME_LEVEL = -10;

function Game() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!gameId) return undefined;
    const gameRef = ref(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setPlayers(data.players ? Object.values(data.players) : []);
        setLoading(false);
      } else {
        navigate("/");
      }
    });
    return () => unsubscribe();
  }, [gameId, navigate]);

  if (loading) {
    return <div>Loading...</div>;
  }

  // Update only the given fields of one player, plus the activity timestamp,
  // in a single multi-path write so concurrent edits to other players survive.
  const updatePlayer = (index, fields) => {
    const updates = { lastActive: new Date().toISOString() };
    for (const [key, value] of Object.entries(fields)) {
      updates[`players/${index}/${key}`] = value;
    }
    update(ref(database, `games/${gameId}`), updates);
  };

  // Replace the whole player list (add/remove/reorder), keyed by index.
  const setAllPlayers = (newPlayers) => {
    update(ref(database, `games/${gameId}`), {
      lastActive: new Date().toISOString(),
      players: Object.fromEntries(newPlayers.map((p, i) => [i, p])),
    });
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
    setAllPlayers(nextRound);
  };

  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) return;
    const usedColors = players.map((player) => player.color);
    const color = PLAYER_COLORS.find((c) => !usedColors.includes(c));
    setAllPlayers([...players, initialPlayer(color)]);
  };

  const removePlayer = (index) => {
    if (players.length <= 1) return;
    setAllPlayers(players.filter((_, i) => i !== index));
  };

  const resetGame = () => {
    setAllPlayers(players.map((player) => initialPlayer(player.color)));
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
          <button
            className="btn btn-outline-primary"
            onClick={() => navigate(`/game/${gameId}/scan`)}
          >
            Link scoring (β)
          </button>
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
    </div>
  );
}

export default Game;
