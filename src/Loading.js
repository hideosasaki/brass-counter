import React, { useEffect, useState } from "react";

// A warm database and a lazy screen's chunk both answer inside this, so a
// spinner shown at once would only flash. A wait that never ends is a
// different message, and ConnectionBanner is the one that gives it.
export const DELAY_MS = 300;

function Loading() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="container mt-3 text-center text-body-secondary">
      <div className="spinner-border" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}

export default Loading;
