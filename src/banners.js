import { useState, useEffect, useRef } from "react";

// The strip across the top of the screen, and who owns it when two bars want
// it at once: the one saying this device cannot reach the database, and the
// one announcing what just happened at the table. The connection bar wins,
// because a database it cannot reach is also why the other bar's button would
// not work. Both sit on Bootstrap's toast layer, above the sticky totals bar
// at 1020 on purpose: while the app is stuck, why it is stuck matters more
// than the numbers it covers.
export const CONNECTION_BANNER_Z = 1080;
export const TABLE_BANNER_Z = CONNECTION_BANNER_Z - 1;

// What a bar is for, rather than what it looks like. Warning covers both the
// destructive actions and a device losing the database; progress covers the
// game moving forward. Kept out of undoActions.js, which is the set of action
// names the database rules accept and has no business naming a stylesheet.
export const TONE_CLASSES = {
  progress: "bg-success text-white",
  warning: "bg-warning fixed-light-surface",
};

// How long the slide out takes. The stylesheet runs the animation and this
// keeps the element alive for exactly that long, so the two numbers have to
// agree: shorten one without the other and the bar vanishes mid-slide.
export const BANNER_SLIDE_MS = 150;

// The classes that animate a bar, so the name of the departing one lives here
// with the rest of what a bar wears rather than in each component.
const ARRIVING = "banner-slide-in";
const LEAVING = `${ARRIVING} banner-leaving`;

// A bar unmounts the moment its reason is gone, which leaves nothing on screen
// to animate away. This holds the last thing it was showing for the length of
// the slide, and hands back the class that sends it back up. A new reason
// arriving mid-slide cancels the departure and takes over.
//
// The third return is for the button on the bar: a bar that ran out of time
// slides away, but one the player has just answered goes at once, and stays
// gone while the write clearing it makes its round trip through the database.
// That last part reads the value by identity, so a caller feeding this from
// database snapshots has to keep the object stable while the node is unchanged.
export function useLeavingBanner(value) {
  const [shown, setShown] = useState(value);
  const dismissed = useRef(null);

  useEffect(() => {
    if (value && value !== dismissed.current) {
      setShown(value);
      return undefined;
    }
    // Past here the value is gone or answered, and the ref has done its job.
    if (!value) dismissed.current = null;
    if (!shown) return undefined;
    const timer = setTimeout(() => setShown(null), BANNER_SLIDE_MS);
    return () => clearTimeout(timer);
  }, [value, shown]);

  const dismiss = () => {
    dismissed.current = value;
    setShown(null);
  };

  return [shown, !value && shown ? LEAVING : ARRIVING, dismiss];
}
