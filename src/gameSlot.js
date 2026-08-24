import { useEffect, useState } from "react";
import {
  ref,
  onValue,
  set,
  remove,
  onDisconnect,
  goOffline,
  goOnline,
  serverTimestamp,
} from "firebase/database";
import { database } from "./firebaseConfig";
import { randomBase36 } from "./gameId";

// A game is one shared link, and nothing stops that link from being posted
// somewhere public. The free plan's hundred simultaneous connections are shared
// by every table at once, so an unbounded game could take all of them and shut
// the others out. Six seats bound the damage to the game the link belongs to:
// four players, plus room for a second device and a spare.
export const MAX_SLOTS = 6;

// The seat comes back the moment the socket dies, so this window only covers
// the release that never arrived at all. Long enough that it can never take a
// seat out from under a game in progress.
export const STALE_MS = 12 * 60 * 60 * 1000;

// True while a full table has this device's socket deliberately closed, so the
// connection banner does not report that as a database it cannot reach.
let released = false;
export const socketReleased = () => released;

// Beside the game rather than inside it: the game screen streams its whole
// game node, so a seat taken here would re-send the game to every device at
// the table, on the very bandwidth this cap exists to protect.
const seatRef = (gameId, index) =>
  ref(database, `presence/${gameId}/slot${index}`);

// Holds one of the game's seats for as long as a game screen is on display.
// Returns whether the table turned out to be full.
export function useGameSlot(gameId) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!gameId) return undefined;
    // Identifies the tab, not the person: the socket is what a seat is spent
    // on, so two tabs on one phone are two arrivals. Kept in memory only — a
    // reload hands the old seat back and takes a fresh one.
    const token = randomBase36(12);
    let held = null;
    let live = true;

    // Which seat is free is not knowable from here: the rules are the only
    // arbiter, and a refusal is how this device learns it lost a race. Start
    // somewhere random so arrivals don't queue up on slot0 in turn.
    const take = async () => {
      const start = (Math.random() * MAX_SLOTS) | 0;
      for (let i = 0; i < MAX_SLOTS; i++) {
        const seat = seatRef(gameId, (start + i) % MAX_SLOTS);
        try {
          await set(seat, { id: token, at: serverTimestamp() });
        } catch {
          continue;
        }
        // The screen may have been left while the write was in flight.
        if (!live) {
          remove(seat);
          return;
        }
        onDisconnect(seat).remove();
        held = seat;
        return;
      }
      if (!live) return;
      // Nothing to sit on, so nothing to watch: dropping the socket here is
      // the point of the cap. A spectator costs the table nothing.
      setFull(true);
      released = true;
      goOffline(database);
    };

    // A reconnect means the server already handed this device's seat away, so
    // coming back has to ask for one again.
    const off = onValue(ref(database, ".info/connected"), (snapshot) => {
      if (snapshot.val() === true) take();
    });

    return () => {
      live = false;
      off();
      if (held) {
        onDisconnect(held).cancel();
        remove(held);
      }
      // Undoes the drop above; a no-op on the ordinary way out.
      released = false;
      goOnline(database);
    };
  }, [gameId]);

  return full;
}
