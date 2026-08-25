// Reading one snapshot of the player list against the last one, so a device
// can light the numbers somebody else at the table has just moved. Nothing
// here touches the database: the snapshots already arrive for other reasons,
// and the difference between two of them is the whole signal.

// A tap by someone else lights its number for this long. Taps that land while
// a light is still on refresh it rather than starting a second one, so a burst
// of them reads as one change rather than a flicker. The wash in index.css
// (@keyframes value-changed) runs for the same length; the two have to agree
// or the light either ends dark or restarts visibly.
export const CHANGE_HOLD_MS = 1600;

// The fields a player taps, and so the ones worth announcing when the tap was
// somebody else's.
const TAPPED_FIELDS = ["money", "spent", "incomePosition"];

// What this device has written and is waiting to see come back. Our own tap
// returns in a snapshot like anybody else's, and telling the two apart is the
// whole of what lets a light mean "somebody else did this". A write is
// remembered as the amount it moved a number by, and claimed back by the first
// change that moves the same number the same way.
export const createOwnWrites = () => {
  let outstanding = {};
  const drop = (key) => {
    if (!outstanding[key]) delete outstanding[key];
  };
  return {
    book(index, field, delta) {
      const key = `${index}:${field}`;
      outstanding[key] = (outstanding[key] || 0) + delta;
      drop(key);
    },
    // How much of this change was ours, taken off the books as it is claimed.
    // A change pulling the other way is nobody's but the person who made it,
    // and leaves ours still waiting.
    claim(key, delta) {
      const mine = outstanding[key] || 0;
      if (!mine || Math.sign(mine) !== Math.sign(delta)) return 0;
      const settled = Math.sign(mine) * Math.min(Math.abs(mine), Math.abs(delta));
      outstanding[key] = mine - settled;
      drop(key);
      return settled;
    },
    // A list-wide write renumbers the seats, so nothing still outstanding
    // names a player any more. Forgetting is what keeps a write that never
    // came back — rejected, or lost with the connection — from sitting on the
    // books for the life of the tab and quietly eating somebody else's change
    // at whatever seat later takes that number.
    forget() {
      outstanding = {};
    },
  };
};

// Which numbers changed between two snapshots by somebody other than us, as
// "index:field" keys. Our own writes are claimed back out of what we find, so
// only what is left over is news.
//
// null means the comparison itself is off: a round ending, a reset, an undo or
// a player leaving rewrites the whole list and reorders it, so an index-by-
// index reading would be nonsense. Each of those carries its own banner
// instead. The undo node is what gives three of them away; adding or removing
// a seat is caught by the length.
export const tappedByOthers = (before, after, { reordered, ours }) => {
  if (!before || reordered || before.length !== after.length) {
    ours.forget();
    return null;
  }
  const moved = [];
  after.forEach((player, index) => {
    for (const field of TAPPED_FIELDS) {
      const delta = player[field] - before[index][field];
      if (!delta) continue;
      const key = `${index}:${field}`;
      if (delta - ours.claim(key, delta)) moved.push(key);
    }
  });
  return moved;
};

// Light what moved, each held as the moment it last did. A tap landing while
// an earlier one is still lit only pushes that moment forward, so a burst
// reads as one change. Handing back the same object when there is nothing to
// say is what keeps an ordinary snapshot from re-rendering the screen.
export const withChanges = (moved) => (lit) => {
  if (!moved) return Object.keys(lit).length ? {} : lit;
  if (!moved.length) return lit;
  const now = Date.now();
  const next = { ...lit };
  for (const key of moved) next[key] = now;
  return next;
};
