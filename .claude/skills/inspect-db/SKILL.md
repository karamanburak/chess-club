---
name: inspect-db
description: Read-only health report of the club data (players, games, tournaments, backups) plus consistency checks — orphan references, ratings that disagree with a replay, knockout/round mismatches. Use when the user reports wrong ratings/standings, a page crashing on their data, or asks what is in the database. Never modifies data.
---

# Inspect the club data

```bash
bun .claude/skills/inspect-db/inspect.ts            # ./data (the real local club)
bun .claude/skills/inspect-db/inspect.ts .demo-data # any other CHESS_DATA_DIR
```

Exit code 2 means problems were listed. The script only reads; it runs `migrate()` and `recomputeRatings()` on in-memory copies.

## How to act on findings

- **Ratings disagree with replay** → a mutation changed a game without calling `recomputeRatings(db)` inside the same `mutate()`. Find that action in `src/lib/actions.ts`; the fix is in the code, the data self-heals on the next result change. Do not patch numbers in the JSON.
- **Orphan game/player references** → usually a `deletePlayer`/`deleteTournament` path that forgot to clean a list. Check the action and `syncKnockout()`.
- **Knockout winner is neither side / missing games** → `syncKnockout()` in `src/lib/knockout.ts` is the single place that must keep matches consistent; it has unit tests in `knockout.test.ts`.
- **"File is not in current shape"** is informational: `migrate()` upgrades on every read and the next write persists it.
- **Postgres club (Vercel)**: there is no local file. Ask the user to download an export from `/admin` (Backups card) and run the script on that folder, or set `DATABASE_URL` locally and export via the app.

## Digging further

For ad-hoc questions ("who has the most games in March?") write a one-off `bun -e` or a script in the scratchpad that imports `../../../src/lib/queries` the same way `inspect.ts` does. Keep it read-only; the only supported write paths are the server actions and `/admin` import.

Backups live in `<dir>/backups/*.json` (daily snapshots, 30 kept). `data/` is git-ignored and contains the admin hash and session secret — never paste its contents into a message or commit.
