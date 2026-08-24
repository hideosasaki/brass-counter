import React from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { useGameSlot, MAX_SLOTS } from "./gameSlot";
import "bootstrap/dist/css/bootstrap.min.css";

// Every game screen sits under this one, so the seat is taken once for the
// whole visit rather than per screen: walking from the game to the score view
// and back must not look like a new arrival.
function GameSession() {
  const { gameId } = useParams();
  const full = useGameSlot(gameId);
  return full ? <TableFull /> : <Outlet />;
}

function TableFull() {
  return (
    <div className="container mt-3" style={{ maxWidth: 480 }}>
      <h4>This game is full</h4>
      <p className="text-secondary">
        A game holds {MAX_SLOTS} devices. Someone has to close it before another
        can join. If you were playing here a moment ago, close the other tab and
        try again.
      </p>
      <div className="d-grid">
        <Link className="btn btn-primary" to="/">
          Start your own game
        </Link>
      </div>
    </div>
  );
}

export default GameSession;
