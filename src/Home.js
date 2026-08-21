import React from "react";
import { updateGame } from "./firebaseConfig";
import { useNavigate } from "react-router-dom";
import { PLAYER_COLORS, initialPlayer, playersByIndex } from "./playerDefaults";
import "bootstrap/dist/css/bootstrap.min.css";

const generateGameId = () =>
  "xxxxxx".replace(/x/g, () => ((Math.random() * 36) | 0).toString(36));

function Home() {
  const navigate = useNavigate();

  const createNewGame = async () => {
    const gameId = generateGameId();
    await updateGame(gameId, {
      players: playersByIndex(PLAYER_COLORS.map((color) => initialPlayer(color))),
    });
    navigate(`/game/${gameId}`);
  };

  return (
    <div className="container min-vh-100 d-flex flex-column justify-content-center">
      <h1 className="text-center">Brass Counter</h1>
      <div className="d-grid gap-2 col-6 mx-auto">
        <button
          className="btn btn-primary text-center"
          onClick={createNewGame}
        >
          Start New Game
        </button>
      </div>
    </div>
  );
}

export default Home;
