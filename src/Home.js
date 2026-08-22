import React from "react";
import { updateGame } from "./firebaseConfig";
import { useNavigate } from "react-router-dom";
import { generateGameId } from "./gameId";
import { PLAYER_COLORS, initialPlayer, playersByIndex } from "./playerDefaults";
import "bootstrap/dist/css/bootstrap.min.css";

function Home() {
  const navigate = useNavigate();

  const createNewGame = async () => {
    const gameId = generateGameId();
    await updateGame(gameId, {
      players: playersByIndex(PLAYER_COLORS.map((color) => initialPlayer(color))),
    });
    // Into the lobby rather than the game: getting the other players in is
    // the first thing that happens at the table.
    navigate(`/game/${gameId}/invite`, { state: { fresh: true } });
  };

  return (
    <div className="container min-vh-100 d-flex flex-column justify-content-center">
      <h1 className="text-center">Brass Counter</h1>
      <p className="text-center text-secondary">
        Everyone plays on their own phone. Start a game, share the code, and
        every device sees the same numbers.
      </p>
      <div className="d-grid gap-2 col-6 mx-auto">
        <button className="btn btn-primary text-center" onClick={createNewGame}>
          Start New Game
        </button>
      </div>
    </div>
  );
}

export default Home;
