# Brass Counter

A shared money and income tracker for the board game [Brass: Birmingham](https://boardgamegeek.com/boardgame/224517/brass-birmingham).

Live at [https://brass-counter.web.app](https://brass-counter.web.app) — no account needed. Start a game, share the URL, and every phone at the table sees the same numbers in real time.

## What it does

- Tracks each player's money, spent amount, and income track position
- "End Round" collects income and re-sorts players into the next turn order (ascending spend, ties keep their order), following the game's rules
- "Loan" pays £30 and drops the income marker three levels, clamped at -10
- "Link scoring (β)" computes end-of-era link points from a photo of the board
- Game state syncs across devices through Firebase Realtime Database; a game lives at its own six-character URL

## Link scoring from a photo (beta)

When an era ends, tap that era on the game screen and photograph the board; the app scores every link tile for you. The rail era appears once the canal era has been scored. The scanner recognizes the board with OpenCV.js (ORB feature matching), finds the link tiles and their player colors, and applies the rulebook's link scoring over the full Birmingham map graph. Both the day and night sides of the board are supported. Anything the classifier isn't sure about is shown for a quick manual check before the totals.

Reflections are the scanner's weak spot. A lamp bouncing off the glossy tiles washes their color out, and the scanner will then ask you about those links, or at worst read a tile as empty. So look through the camera before you shoot: if there's a sheen anywhere on the board, move until it's gone. Turning to a different angle often leaves the sheen where it was, because what moves it is your position relative to the light. Indoor light at night leaves more links for the manual check than daylight does. The last screen puts every link on the board image so you can compare with the real thing before the totals.

The whole pipeline runs in your browser. The photo is processed on your device and never uploaded anywhere.

Confirmed links are shared with everyone in the game: every phone gets a live score screen where anyone can enter the icon counts, correct a link's owner, and watch the totals update in real time, just like the shared money counters. Only the link assignments and icon counts are synced; the photo itself stays on the device that took it.

## Development

Built with Create React App. The usual commands apply:

```
npm install
npm start        # dev server
npm test         # unit tests
npm run build    # production build
```

Deployment goes through Firebase Hosting, with database access rules in `database.rules.json`:

```
npx firebase-tools deploy --only database,hosting
```

To self-host, create your own Firebase project (Realtime Database + Hosting), replace the config in `src/firebaseConfig.js`, and deploy.

## Board data and scoring

`src/boardData.js` and `src/scoring.js` contain the full Birmingham map graph (20 cities, 5 merchants, 2 farm breweries, 39 links) and an end-of-era scoring engine, cross-checked against the official rulebook. The photo scanner in `src/scan/` builds on them.

## Support

Brass Counter is free and has no server costs to cover. If it made your game night easier, you can [buy me a coffee](https://ko-fi.com/hideosasaki).

## License

[MIT](LICENSE). This is an unofficial fan-made tool. Brass: Birmingham is a trademark of Roxley Games; this project is not affiliated with or endorsed by them.
