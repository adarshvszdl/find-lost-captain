# The Search for Our Long-Lost Captain

A live pirate icebreaker. Players race through four island challenges on their own phones or laptops, win pieces of the captain's portrait, and assemble it at the end. The first mate (host) runs the game from a shared screen.

No sign-in is needed. Players open the link and type a name; the host page is protected by a password.

## Run it locally

Requires Node 20.6 or newer.

```bash
npm install
cp .env.example .env        # then fill in MONGODB_URI and HOST_KEY (.env already exists on Adarsh's machine)
npm run db:init             # creates the database, collections and indexes (safe to re-run)
npm run local               # starts on http://localhost:8080
```

- Players: `http://localhost:8080/`
- First mate: `http://localhost:8080/#host` (asks for `HOST_KEY`)

## How a game runs

1. The first mate opens `/#host`, signs in and clicks **Open the game**.
2. Players open the plain link and join with a name.
3. The first mate starts each island, then ends it. Players first see that island's rules with a countdown (`INTRO_SECONDS` in `.env`, default 10; 0 turns it off). Each player's clock starts when the challenge appears on their own screen.
4. After the last challenge (the portrait), the first mate reveals 3rd, 2nd and 1st place, then clicks **Publish results to players**.

## Project layout

| Path | What it is |
| --- | --- |
| `server/index.js` | Fastify server: static files, JSON API, live event stream (SSE) |
| `server/game.js` | Game rules, host actions, result saving, the per-copy state cache |
| `server/rounds.js` | Round keys and time caps (must match `public/js/core.js`) |
| `server/db.js` | MongoDB connection, collections and indexes |
| `public/index.html` | Page markup and styles |
| `public/js/core.js` | Story content, the island map, ship, clouds, and the five challenges |
| `public/js/app.js` | Screens, joining, results, first-mate controls, talking to the server |
| `scripts/db-init.js` | One-off database setup |
| `loadtest/simulate.js` | Full-game load test (see `docs/LOAD-TEST.md`) |
| `docs/DEPLOY-AWS.md` | How to run this on AWS for 300+ players |

## API

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/healthz` | load balancer | 200 when the database is reachable |
| GET | `/api/state` | anyone | current public game state |
| GET | `/api/stream` | anyone | Server-Sent Events: `state` on every change, `ping` every 15 s |
| POST | `/api/join` | player | `{ name, playerId?, token? }` returns `{ playerId, token, player }` |
| GET | `/api/me` | player | saved times after a page reload, plus rank once results are in |
| GET | `/api/rank` | player | rank only (served from memory) |
| POST | `/api/result` | player | `{ round, t, missed }`; first answer wins |
| POST | `/api/host/login` | host | checks the password |
| GET | `/api/host/players` | host | everyone in the current game |
| POST | `/api/host/action` | host | `{ action: new / start / end / reveal / publish, round?, expect }` |

Player calls send `x-player-id` and `x-player-token`; host calls send `x-host-key`.

## Data

Database `longlost_captain` (set by `MONGODB_DB`):

- `games`: one document, `_id: "current"`, holding the live game. "New game" replaces it.
- `players`: one document per player per device, indexed on `{ gameId, joinedAt }`.

The load tests use a separate database, `longlost_captain_loadtest`, which can be dropped at any time.

## Editing the game

The browser code was generated from the Claude artifact version of the game. From now on, edit `public/js/core.js` (content, map, challenges) and `public/js/app.js` (screens and server calls) directly. If you change a round's key or time cap, change `server/rounds.js` to match.
