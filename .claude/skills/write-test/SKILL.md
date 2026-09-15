---
name: write-test
description: Write or extend bun unit tests for src/lib (elo, pairing, queries/standings, club, db/migrate, pin, tokens) using the fixtures in src/lib/__tests__/fixtures.ts. Use when adding logic to src/lib, fixing a bug there (write the failing test first), or when the user asks for tests/coverage.
---

# Unit tests

Runner: `bun test` (`bun test src/lib/__tests__/pairing.test.ts` for one file, `bun test -t "bye"` for a name filter). Tests live in `src/lib/__tests__/*.test.ts`, one file per lib module. Only `src/lib` is tested; pages, components and actions are not unit-tested (actions need Next request context — cover their pure parts by moving logic into `queries.ts`/`club.ts`/`pairing.ts` instead).

## Fixtures (`fixtures.ts`)

```ts
import { db, game, player, tournament } from "./fixtures";
const d = db([player("a", 1500), player("b", 1400)], [game("a", "b", "1-0")]);
recomputeRatings(d);   // whenever ratings/standings matter
```

- `player(id, rating?, extra?)` — name is the id upper-cased.
- `game(white, black, result | null, extra?)` — auto `seq`, ids `g1, g2…`, dates in Jan 2026 in call order; pass `{ tournamentId, round, board }` or `{ sessionId }` for tournament/club-night games, `rated: false` for forfeits.
- `tournament(participantIds, extra?)` — id `t1`, Swiss, 3 rounds; build `rounds` from the games like `standings.test.ts` `setup()` does.
- `db(players, games?, tournaments?)` — full `Database`; add `sessions`, `seasons` via spread.
- When a new field lands in `types.ts`, add its default here first; otherwise every test file breaks on type-check.

## Style

- `describe` per function, `test` names are sentences about behaviour ("odd field gives one bye, never to someone who already had one"), not implementation.
- Assert on outcomes the club cares about (who is paired, who wins the tiebreak, what the rating is), with a comment explaining the arithmetic when a number is not obvious.
- Randomised code (`random` pairing, `shuffle`, `avatarChoices`) is tested with a loop of 20–30 trials asserting invariants, never exact output.
- `db.ts` tests need an isolated folder: copy the `CHESS_DATA_DIR` + dynamic `import("../db")` pattern at the top of `db.test.ts`; never let a test touch `./data`.
- Crypto (`pin.ts`, `tokens.ts`) is tested with real hashing; keep those tests few, scrypt is slow.
- Bug fix flow: write the test that reproduces the report, see it fail, fix, see it pass. Mention both runs in the report.

Run the `check` skill afterwards; `bun test` alone does not type-check.
