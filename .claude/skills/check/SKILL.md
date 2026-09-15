---
name: check
description: Run the full verification chain for this repo (bun test, tsc, eslint, next build) and report what failed. Use before telling the user a change is done, or when they ask "does it still build / pass".
---

# Check

Run `bash .claude/skills/check/check.sh` from the repo root. Pass `--fast` to skip `next build` (tests + tsc + lint only, a few seconds) when iterating; run the full chain before declaring a task finished.

The script stops at the first failing step and prints that step's tail. Steps, in order:

1. `bun test` — unit tests in `src/lib/__tests__/`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun run build` (skipped with `--fast`; uses `NEXT_DIST_DIR=.next-check` so the running dev server is untouched)

## Reporting

- Say which steps passed and which failed. Quote the failing output in a code block; do not paraphrase compiler errors.
- A failing test in `elo.test.ts` or `standings.test.ts` after a data-model change usually means `fixtures.ts` needs the new field too.
- `tsc` errors in `src/app/**/page.tsx` about `PageProps<"/route">` mean a route was added or renamed: run `bun run build` once (or `bunx next typegen`) so Next regenerates the route types.
- Never "fix" a check by loosening a type, adding `eslint-disable` or deleting a test without saying so explicitly.
