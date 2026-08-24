import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Home from "./Home";
import Game from "./Game";
import GameSession from "./GameSession";
import Loading from "./Loading";
import { isEra } from "./eras";

const Scan = lazy(() => import("./scan/Scan"));
const LinkScore = lazy(() => import("./LinkScore"));
// Lazy so the QR encoder is downloaded by the players who open the lobby, not
// on every first paint.
const Invite = lazy(() => import("./Invite"));

const LazyScreen = ({ children }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
);

// Both era screens write to linkScore/{era}, so a URL naming anything else is
// a bad address: it never reaches them and the screens can trust their era.
function EraScreen({ children }) {
  const { gameId, era } = useParams();
  if (!isEra(era)) return <Navigate to={`/game/${gameId}`} replace />;
  return <LazyScreen>{children}</LazyScreen>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* The screens of one game are nested so the seat is taken once for the
          visit: walking between them must not read as a new arrival. */}
      <Route path="/game/:gameId" element={<GameSession />}>
        <Route index element={<Game />} />
        <Route
          path="invite"
          element={
            <LazyScreen>
              <Invite />
            </LazyScreen>
          }
        />
        <Route
          path="scan/:era"
          element={
            <EraScreen>
              <Scan />
            </EraScreen>
          }
        />
        <Route
          path="score/:era"
          element={
            <EraScreen>
              <LinkScore />
            </EraScreen>
          }
        />
      </Route>
      {/* Hosting rewrites unknown paths to index.html rather than serving a
          404, so a truncated link arrives here and needs somewhere to go. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
