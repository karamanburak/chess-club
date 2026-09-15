---
name: seed-demo
description: Generate a realistic demo club (players, friendlies, a finished and a running Swiss tournament, a club night) into an isolated data folder and start a second dev instance on port 3001 against it. Use when the user wants to try a UI change with real-looking data, or asks for test/demo/sample data. Never touches data/db.json.
---

# Seed a demo club

1. Generate the data (deterministic; same `--seed` gives the same club):

   ```bash
   bun .claude/skills/seed-demo/seed.ts .demo-data --players 12 --friendlies 60 --seed 42
   ```

   The script refuses to write into `./data`. It builds the club through the real `migrate()`, `generatePairings()` and `recomputeRatings()`, so ratings, colours and byes are consistent with what the app would produce.

2. Run a second instance against it (leaves the user's own dev server and `.next` alone):

   ```bash
   CHESS_DATA_DIR=.demo-data NEXT_DIST_DIR=.next-e2e bun run dev -- -p 3001
   ```

   Start it in the background and open http://localhost:3001. No admin password or member code is set, so the club is open; `/admin` offers the first-time setup form.

3. Make sure `.demo-data/` and `.next-e2e/` are ignored by git (`.next-e2e` already is). If `.demo-data` is missing from `.gitignore`, add `/.demo-data/` and tell the user.

## Variants

- More or fewer players/games: `--players 8 --friendlies 20`. Max 20 named players.
- Re-seed from scratch: delete the folder first (`rm -rf .demo-data`), otherwise the file is simply overwritten and any snapshots in `.demo-data/backups/` stay.
- To reproduce a bug from the user's real data, do NOT seed. Copy `data/db.json` into a scratch folder and point `CHESS_DATA_DIR` there instead, so the original is never modified.
