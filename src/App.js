import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Home from "./Home";
import Game from "./Game";
import { isEra } from "./eras";

const Scan = lazy(() => import("./scan/Scan"));
const LinkScore = lazy(() => import("./LinkScore"));

// Both era screens write to linkScore/{era}, so a URL naming anything else is
// a bad address: it never reaches them and the screens can trust their era.
function EraScreen({ children }) {
  const { gameId, era } = useParams();
  if (!isEra(era)) return <Navigate to={`/game/${gameId}`} replace />;
  return (
    <Suspense fallback={<div className="container mt-3">Loading...</div>}>
      {children}
    </Suspense>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game/:gameId" element={<Game />} />
      <Route
        path="/game/:gameId/scan/:era"
        element={
          <EraScreen>
            <Scan />
          </EraScreen>
        }
      />
      <Route
        path="/game/:gameId/score/:era"
        element={
          <EraScreen>
            <LinkScore />
          </EraScreen>
        }
      />
    </Routes>
  );
}

export default App;
