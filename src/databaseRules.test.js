// The database rules cannot import the app's constants, so the copies are
// pinned here instead of by a comment. A miss shows up as a rejected write on
// a rare path (the undo node especially), which is hard to notice by hand.
import rules from "../database.rules.json";
import { generateGameId } from "./gameId";
import { MAX_LINK_ICONS } from "./linkScoreData";
import { PLAYER_TOKEN_CLASSES, initialPlayer } from "./playerDefaults";
import { ERAS } from "./eras";
import { UNDO_ACTIONS } from "./undoActions";
import { MAX_SLOTS, STALE_MS } from "./gameSlot";

const game = rules.rules.games.$gameId;
// Each shape is written twice: once for the live node, once for the snapshot
// the undo node keeps.
const linkScoreShapes = [game.linkScore, game.undo.linkScore];
const playerShapes = [game.players.$playerId, game.undo.snapshot.$playerId];

// The accepted values of a rule written as an or-chain of equality tests,
// e.g. "newData.val() == 'canal' || newData.val() == 'rail'".
const accepted = (validate, pattern) =>
  [...validate.matchAll(pattern)].map((m) => m[1]).sort();

describe("database.rules.json mirrors the app's constants", () => {
  test("every linkScore block caps icon counts at MAX_LINK_ICONS", () => {
    for (const shape of linkScoreShapes) {
      const validate = shape.$era.icons.$locationId[".validate"];
      const cap = Number(validate.match(/newData\.val\(\) <= (\d+)/)[1]);
      expect(cap).toBe(MAX_LINK_ICONS);
    }
  });

  test("every linkScore block accepts exactly the token color classes", () => {
    for (const shape of linkScoreShapes) {
      expect(
        accepted(shape.$era.links.$linkId[".validate"], /newData\.val\(\) == '(\w+)'/g)
      ).toEqual(Object.values(PLAYER_TOKEN_CLASSES).sort());
    }
  });

  test("every linkScore block accepts exactly the game's eras", () => {
    for (const shape of linkScoreShapes) {
      expect(accepted(shape.$era[".validate"], /\$era == '(\w+)'/g)).toEqual(
        [...ERAS].sort()
      );
    }
  });

  // The rarest write path: a wrong action name only fails when someone
  // actually undoes something.
  test("the undo node accepts exactly the undoable actions", () => {
    expect(
      accepted(game.undo.action[".validate"], /newData\.val\(\) == '(\w+)'/g)
    ).toEqual(Object.keys(UNDO_ACTIONS).sort());
  });

  // An id the rules reject is invisible from inside the app: the writes just
  // never land, and a fresh game looks like it did nothing.
  test("generated game ids match the id pattern the rules enforce", () => {
    // Reading and writing a game are gated by the same id, so the two
    // conditions drifting apart would let a game be written but never read.
    expect(game[".read"]).toBe(game[".write"]);
    const pattern = new RegExp(game[".write"].match(/matches\(\/(.+)\/\)/)[1]);
    for (let i = 0; i < 20; i++) {
      expect(generateGameId()).toMatch(pattern);
    }
  });

  // The player node is closed ($other: false), so a field added to a player
  // without a matching rule makes every write fail from the first game on.
  test("every player block allows exactly the fields a player has", () => {
    const fields = Object.keys(initialPlayer("#000000")).sort();
    for (const shape of playerShapes) {
      expect(Object.keys(shape).filter((k) => k !== "$other").sort()).toEqual(fields);
    }
  });

  // The seat cap only exists in the rules: the app asks for a seat, and this
  // pattern is the whole of what stops a link that escaped the table from
  // taking the project's hundred simultaneous connections.
  test("the presence node offers exactly MAX_SLOTS seats", () => {
    const validate = rules.rules.presence.$gameId.$slot[".validate"];
    const pattern = new RegExp(validate.match(/\$slot\.matches\(\/(.+?)\/\)/)[1]);
    for (let i = 0; i < MAX_SLOTS; i++) {
      expect(`slot${i}`).toMatch(pattern);
    }
    expect(`slot${MAX_SLOTS}`).not.toMatch(pattern);
  });

  // Seats sit outside the game node, so they need a gate of their own: without
  // one the closed root rejects every claim and every table reads as full.
  test("seats are gated by the id of the game they belong to", () => {
    expect(rules.rules.presence.$gameId[".write"]).toBe(game[".write"]);
  });

  // A seat whose release never arrived would otherwise be held forever, and
  // the window the rules allow has to be the one the app was written against.
  test("an abandoned seat goes stale after STALE_MS", () => {
    const validate = rules.rules.presence.$gameId.$slot[".validate"];
    expect(Number(validate.match(/now - (\d+)/)[1])).toBe(STALE_MS);
  });
});
