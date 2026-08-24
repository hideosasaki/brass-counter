# Brass Counter

A shared money and income tracker for the board game [Brass: Birmingham](https://boardgamegeek.com/boardgame/224517/brass-birmingham).

Live at [https://brass-counter.web.app](https://brass-counter.web.app). No account needed. Start a game, share the link or show the QR code, and every phone at the table sees the same numbers in real time.

## What it does

- Tracks each player's money, what they've spent this round, and their position on the income track
- "End Round" collects income and sets the next turn order, least spent first, with ties keeping the order they were in
- "Loan" gives the player £30 and drops the income marker three levels. The button does nothing once that would take income below -10
- "Link scoring (β)" computes end-of-era link points from a photo of the board
- Game state syncs across devices through Firebase Realtime Database, and each game gets its own six-character id that is the whole URL you share
- A game holds six devices at once. That's the table plus a spare, and it stops a link that ends up somewhere public from eating the connections the other tables share

## Link scoring from a photo

When an era ends, tap that era on the game screen and photograph the board; the app scores the link tiles for you. The rail era appears once the canal era has been scored. The scanner recognizes the board with OpenCV.js (ORB feature matching, around 10MB of WASM on first use), finds the link tiles and their player colors, and applies the rulebook's link scoring over the full Birmingham map graph. Both the day and night sides of the board are supported. Anything the scanner isn't sure about is shown for a quick manual check before the totals.

Reflections are the scanner's weak spot. A lamp bouncing off the glossy tiles washes the color out of them, so the scanner asks about those links, or at worst reads a tile as empty. Look through the camera before you shoot, and if there's a sheen anywhere on the board, move the board or the lamp until it's gone. Changing the camera angle usually leaves the sheen where it was, because what moves it is the board's position relative to the lamp. Indoor light at night leaves more links for the manual check than daylight does. The last screen draws every link it read onto your photo, so you can check it against the real board before you accept the totals.

The whole pipeline runs in your browser, so the photo never leaves your device.

Confirmed links are shared with everyone in the game. Every phone gets a live score screen where anyone can enter the icon counts (the number of link icons showing at each location), correct a link's owner, add a link the scan missed, and watch the totals update in real time, just like the shared money counters. Only the link assignments and icon counts are synced; the photo itself stays on the device that took it.

## Development

Built with Create React App. The usual commands apply:

```
npm install
npm start                      # dev server
npm test -- --watchAll=false   # unit tests
npm run build                  # production build
```

CI runs the same tests and a production build on Node 24. Deployment goes through Firebase Hosting, with database access rules in `database.rules.json`:

```
npx firebase-tools deploy --only database,hosting
```

To self-host, create your own Firebase project (Realtime Database + Hosting), replace the config in `src/firebaseConfig.js`, point `.firebaserc` at your own project id, and deploy.

There are no accounts, so anyone holding a game's six-character id can read and write that game. The ids are six base36 characters from `Math.random`, which keeps strangers from wandering into your table but is not a secret worth guarding. The rules in `database.rules.json` allow nothing outside that shape.

## Board data and scoring

`src/boardData.js` and `src/scoring.js` contain the full Birmingham map graph (20 cities, 5 merchants, 2 farm breweries, 39 links) cross-checked against the official rulebook, plus the end-of-era link scoring built on it. The photo scanner in `src/scan/` builds on them, and `scripts/reference-tools/README.md` covers how the canonical references and link masks were built and how to re-score them against real photos.

Birmingham is the only board supported today, and the blocker is data rather than code. The scanner works from canonical reference images and hand-traced link masks of a physical board, and I don't own Lancashire. A port would need its own map graph, reference images, link masks and player color prototypes. Nothing else in the pipeline is tied to a particular board.

## Non-goals

- Scanning industry tiles. The number is printed on the flipped tile, and you'd re-read it to check whatever a scanner told you, so there's nothing to save. Links are the other way round. Working out who owns each of the 39 of them and running the scoring rules over the map is the part worth automating.
- Server-side recognition. Sending photos to a hosted model would put an API key on an app with no accounts and no budget, and it would break the promise that the photo never leaves your device.
- Collecting scans to train a classifier. Measured against the current corpus, a small learned model asks more questions than the hand-set thresholds in `src/scan/classifier.js`, and each of those thresholds has its evidence in the comment above it.

## Support

Brass Counter is free and has no server costs to cover. Next time you're getting drinks for the table, you can [add a coffee for me](https://ko-fi.com/hideosasaki).

## License

[MIT](LICENSE). This is an unofficial fan-made tool. Brass: Birmingham is a trademark of Roxley Games; this project is not affiliated with or endorsed by them.
