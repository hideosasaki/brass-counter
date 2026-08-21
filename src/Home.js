import React from "react";
import { ref, set } from "firebase/database";
import { database } from "./firebaseConfig";
import { useNavigate } from "react-router-dom";
import { PLAYER_COLORS, initialPlayer } from "./playerDefaults";
import "bootstrap/dist/css/bootstrap.min.css";

const generateGameId = () =>
  "xxxxxx".replace(/x/g, () => ((Math.random() * 36) | 0).toString(36));

function Home() {
  const navigate = useNavigate();

  const createNewGame = async () => {
    const gameId = generateGameId();
    await set(ref(database, `games/${gameId}`), {
      lastActive: new Date().toISOString(),
      players: Object.fromEntries(
        PLAYER_COLORS.map((color, i) => [i, initialPlayer(color)])
      ),
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
