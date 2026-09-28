# Daily CollegeBasketballData update

The Hub now has a server-side ingestion job for the 2026-27 season. It runs at approximately 6:00 a.m. Eastern and writes the current validated feed to `public/cbb-hub/data/cbbd-current.json`.

## Data collected

Every run requests:

- current team information and complete season rosters, including player IDs, positions and listed heights;
- games from the previous two days through the next seven days;
- team and player box scores from the previous two days;
- current team and player season statistics;
- team and player shooting profiles;
- raw play-by-play for every finalized game in the refresh window;
- player shot-zone and creation metrics derived from those raw plays;
- season and position-group shot-zone priors for the VERSPI+D shrinkage formula;
- adjusted-efficiency ratings; and
- Elo ratings.

The job stores each raw response under `data/cbbd/raw/<date>/<run timestamp>/`, writes a local latest-run manifest, validates identities and duplicate game IDs, then atomically replaces the public feed. Raw snapshots are ignored by Git; scheduled GitHub runs preserve them as 90-day workflow artifacts.

The compact `data/cbbd/pbp-state.json` file keeps one derived contribution per game. When a game is fetched again after an official correction, that game's old contribution is replaced instead of double-counted. The public feed contains the newly fetched raw plays in `playByPlay` and the season-to-date player results in `pbpPlayerStats`.

## Local setup

Request a key at <https://collegebasketballdata.com/key>, then set it only in the server environment:

```bash
export CBBD_API_KEY='your-key'
npm run data:cbbd:2026
```

For a historical or future season:

```bash
node scripts/update-cbbd-daily.mjs --season 2027
```

The API uses the starting year, so `2026` represents the 2026-27 season. Without `--season`, the script derives the season from the current Eastern date: July through December use the current year, while January through June use the previous year.

## GitHub scheduler

The workflow at `.github/workflows/cbbd-daily.yml` requires this repository secret:

- `CBBD_API_KEY`: the CollegeBasketballData API key.

To publish each successful update automatically, also add:

- `FIREBASE_SERVICE_ACCOUNT`: a Firebase service-account JSON value authorized for Hosting deployments.

The workflow runs at both UTC offsets that can correspond to 6:00 a.m. Eastern and uses an Eastern-time gate so only one scheduled run ingests data. Manual workflow runs bypass the time gate.

### Add the GitHub secrets

1. Push this project to its GitHub repository.
2. Open the repository on GitHub.
3. Select **Settings → Secrets and variables → Actions**.
4. Select **New repository secret**.
5. Name it `CBBD_API_KEY`, paste the key from CollegeBasketballData, and save it.
6. If Firebase should deploy after each run, open **Firebase Console → Project settings → Service accounts → Generate new private key**. Create another GitHub repository secret named `FIREBASE_SERVICE_ACCOUNT` and paste the complete downloaded JSON as its value.
7. Open **Actions → Update 2026-27 college basketball data → Run workflow** once to verify the first update.

Never commit either secret or put it under `public/`.

## Play-by-play calculations

The raw `/plays/game/{gameId}` response is the source of truth. The derivation uses player IDs rather than name matching and calculates:

- makes, attempts, attempts per game, and field-goal percentage for rim, paint, midrange, above-break three, and corner three;
- assisted and unassisted field goals, split into two-pointers and three-pointers;
- assisted percentage overall, for twos, for threes, and at the rim;
- rim assists, paint assists, rim-or-three assists, and their per-40 rates;
- unassisted points per game; and
- points created per game: `(official player points + points scored directly from that player's assists) / games`.

The `pbpBenchmarks` rows also provide `priorPct` and `leagueAttemptShare` for the Big and Guard-Wing pools. Those are the two PBP-derived league inputs used by the 25-attempt zone shrinkage and neutral shot-diet weighting in Efficiency.

For VERSPI+D, these support the neutral shot-zone Efficiency calculation and the `ptsCreatedG / MPG` term in Playmaking. A shot whose API `shotInfo.range` cannot be classified is recorded in the coverage diagnostics and is not forced into a zone. This prevents an unknown shot from silently changing the player's ranking.

Run the deterministic calculation tests with:

```bash
npm test
```

## Model boundary

The daily feed supplies box scores, usage, shooting, rebounds, assists, turnovers, win shares, adjusted team ratings, Elo, and the raw/derived PBP fields above. RAPM, DRAPM, and WARP/40 are not documented CBBD outputs. They remain external inputs, so you can upload the RAPM file separately without changing the PBP calculations.
