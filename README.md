# Brass Counter

A shared money and income tracker for the board game [Brass: Birmingham](https://boardgamegeek.com/boardgame/224517/brass-birmingham).

Live at **https://brass-counter.web.app** — no account needed. Start a game, share the URL, and every phone at the table sees the same numbers in real time.

## What it does

- Tracks each player's money, spent amount, and income track position
- "End Round" collects income and re-sorts players into the next turn order (ascending spend, ties keep their order), following the game's rules
- "Loan" pays £30 and drops the income marker three levels, clamped at -10
- Game state syncs across devices through Firebase Realtime Database; a game lives at its own six-character URL

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

`src/boardData.js` and `src/scoring.js` contain the full Birmingham map graph (20 cities, 5 merchants, 2 farm breweries, 39 links) and an end-of-era scoring engine, cross-checked against the official rulebook. They are groundwork for a planned feature: calculating link scores from a photo of the board.

## Note

This is an unofficial fan-made tool. Brass: Birmingham is a trademark of Roxley Games; this project is not affiliated with or endorsed by them.
