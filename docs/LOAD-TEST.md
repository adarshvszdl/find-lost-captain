# Load testing

## What the test does

`loadtest/simulate.js` plays a **complete game** with simulated players and a simulated first mate, using the same calls a real browser makes:

1. The first mate opens a new game and keeps polling the crew list every 1.5 s, like the host screen does.
2. Each player:
   - loads the page, its scripts and the portrait
   - opens the live update stream
   - joins at a random moment during the ramp-up
3. The first mate runs all five rounds: start, wait, end.
4. Players submit times at random moments in each round:
   - about 8% never finish a round
   - about 5% run out of time
   - about 10% reload the page mid-game
5. At the results, every player asks for their rank at once, which is the real burst. The first mate reveals the podium and publishes.
6. The test checks the data:
   - every player is saved
   - every submitted time is stored exactly as sent
   - every player gets a rank
   - the standings count everyone

It reports, per request type, the response times (p50, p95, p99, max) and errors. It also reports how long a host click takes to reach each player's open stream. Each run is saved to `loadtest/results/` (git-ignored). The script prints **PASS** only when all checks hold with zero errors.

Multiple `--base` URLs spread players across server copies. This proves that copies behind a load balancer stay in sync.

> The test starts a **new game** on the server it targets. Never run it during a real event. Locally, use `MONGODB_DB=longlost_captain_loadtest` so test data stays out of the event database.

## Run it locally

```bash
# two server copies against the test database
MONGODB_DB=longlost_captain_loadtest PORT=8081 node --env-file=.env server/index.js &
MONGODB_DB=longlost_captain_loadtest PORT=8082 node --env-file=.env server/index.js &

node loadtest/simulate.js --base http://localhost:8081,http://localhost:8082 \
  --host-key "$HOST_KEY" --players 300 --ramp 30 --round-secs 20 --between-secs 4
```

Options: `--players` (default 300), `--ramp` seconds over which players join (30), `--round-secs` how long each round stays open (40), `--between-secs` (6).

## Results so far

Run on 13 Nov 2026 from a Windows laptop: two local server copies, Atlas cluster `cluster0` over the internet, database `longlost_captain_loadtest`.

| | 300 players | 1,000 players |
| --- | --- | --- |
| Result | PASS | PASS |
| Errors | 0 | 0 |
| Streams open at peak / dropped | 300 / 0 | 1,000 / 0 |
| Join (p50 / p99) | 107 / 472 ms | 108 / 430 ms |
| Save a time (p50 / p99), 1,391 and 4,601 saves | 55 / 130 ms | 55 / 81 ms |
| Rank at results (p50 / p99) | 1 / 3 ms | 1 / 2 ms |
| Host click reaches every player (p50 / p95 / max) | 236 / 715 / 753 ms | 244 / 651 / 1,347 ms |
| Data checks (saved, times exact, ranks, standings) | all correct | all correct |

An earlier run found and fixed three problems before these numbers:
- Joining through the second server copy right after "New game" could file a player under the old game.
- The rank burst at the results took up to 3.8 s.
- Result saves made three database calls instead of one.

## Plan for the AWS deployment

Run these against the deployed site **before the event day**, from an EC2 instance in the same region. A laptop on home Wi-Fi measures the Wi-Fi, not the site.

| Step | Command | Pass when |
| --- | --- | --- |
| 1. Smoke | `--players 20 --round-secs 15` | PASS |
| 2. Expected crowd | `--players 300 --round-secs 40` | PASS; save p99 under 500 ms; host click max under 3 s |
| 3. Headroom | `--players 600`, then `--players 1000` | PASS; no 5xx at the load balancer |
| 4. Failover | during a 300-player run, stop one ECS task (`aws ecs stop-task ...`) | PASS; stream drops recover within seconds; no lost results |
| 5. Soak | `--players 300 --round-secs 120` (about 12 minutes) | PASS; memory flat in ECS metrics |

`--base` is the public HTTPS URL, for example `--base https://voyage.yourcompany.com`. The load balancer spreads the simulated players across tasks by itself.

Watch while it runs:
- ALB target group: request count, target response time, 4xx/5xx, healthy hosts.
- ECS service: CPU and memory per task.
- Atlas: operations per second, connections, query targeting.

When you're done, open `/#host` and click **New game** to clear the test game.

## Beyond about 2,000 players from one machine

A single load-generating machine eventually runs out of sockets or CPU before the server does. To go further, run the script from two or three EC2 instances at once with smaller `--players` each, and drive the host from only one of them. That last part needs a small change: a `--no-host` flag that only adds players.
