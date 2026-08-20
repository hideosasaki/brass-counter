import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./Home";
import Game from "./Game";

const Scan = lazy(() => import("./scan/Scan"));

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game/:gameId" element={<Game />} />
      <Route
        path="/game/:gameId/scan"
        element={
          <Suspense fallback={<div className="container mt-3">Loading...</div>}>
            <Scan />
          </Suspense>
        }
      />
    </Routes>
  );
}

export default App;
