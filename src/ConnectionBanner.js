import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "./firebaseConfig";
import { socketReleased } from "./gameSlot";

// Long enough that the reconnects of an ordinary game night stay silent, short
// enough that a player staring at a screen that will not load learns why.
export const GRACE_MS = 5000;

// Bootstrap's toast layer, which the table's own toasts already use. Above the
// sticky totals bar at 1020 on purpose: while the app cannot reach the
// database, why it is stuck matters more than the numbers it covers.
const BANNER_Z = 1080;

// Two things keep a device from the database, and it can tell them apart: its
// own network being down, and the free plan's hundred simultaneous connections
// all being taken. Without this the screens simply never finish loading.
function ConnectionBanner() {
  // Asking for a ref is what opens the socket, and that socket is one of the
  // hundred. Only the game screens have anything to report, so a reader parked
  // on the landing page never spends one.
  const watching = useLocation().pathname.startsWith("/game/");
  const [connected, setConnected] = useState(true);
  const [reason, setReason] = useState(null);

  useEffect(() => {
    if (!watching) {
      setConnected(true);
      return undefined;
    }
    // A client-side path: it reports this device's own connection, and it
    // answers while offline, which is exactly when it is needed.
    return onValue(ref(database, ".info/connected"), (snapshot) =>
      setConnected(snapshot.val() === true)
    );
  }, [watching]);

  useEffect(() => {
    if (connected) {
      setReason(null);
      return undefined;
    }
    // Read when the banner is about to show rather than at render: by then the
    // device has settled on whether it has a network at all.
    const timer = setTimeout(() => {
      if (socketReleased()) return;
      setReason(navigator.onLine ? "busy" : "offline");
    }, GRACE_MS);
    return () => clearTimeout(timer);
  }, [connected]);

  if (!reason) return null;

  return (
    <div
      role="status"
      className="position-fixed top-0 start-0 w-100 text-center small py-2 px-3 bg-warning fixed-light-surface"
      style={{ zIndex: BANNER_Z }}
    >
      {reason === "offline"
        ? "You're offline. The game will catch up when you're back."
        : "Can't reach the game. The server may be busy, still trying."}
    </div>
  );
}

export default ConnectionBanner;
