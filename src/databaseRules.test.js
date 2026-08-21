// The database rules cannot import the app's constants, so the copies are
// pinned here instead of by a comment. A miss shows up as a rejected write on
// a rare path (the undo node especially), which is hard to notice by hand.
import rules from "../database.rules.json";
import { MAX_LINK_ICONS } from "./linkScoreData";
import { PLAYER_TOKEN_CLASSES, initialPlayer } from "./playerDefaults";
import { ERAS } from "./eras";
import { UNDO_LABELS } from "./undoActions";

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
    ).toEqual(Object.keys(UNDO_LABELS).sort());
  });

  // The player node is closed ($other: false), so a field added to a player
  // without a matching rule makes every write fail from the first game on.
  test("every player block allows exactly the fields a player has", () => {
    const fields = Object.keys(initialPlayer("#000000")).sort();
    for (const shape of playerShapes) {
      expect(Object.keys(shape).filter((k) => k !== "$other").sort()).toEqual(fields);
    }
  });
});
