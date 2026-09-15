#!/usr/bin/env bash
# Full verification chain. Stops at the first failure and prints its output.
set -u
cd "$(dirname "$0")/../../.." || exit 1
TMPDIR="${TMPDIR:-/tmp}"
FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

run() {
  local name="$1"; shift
  local out
  printf '▶ %s\n' "$name"
  if out="$("$@" 2>&1)"; then
    printf '  ✔ ok\n'
  else
    printf '  ✘ FAILED\n\n%s\n' "$(printf '%s' "$out" | tail -60)"
    exit 1
  fi
}

run "bun test" bun test
run "tsc --noEmit" bunx tsc --noEmit
run "eslint" bun run lint
if [ "$FAST" = 0 ]; then
  # next build adds its dist folder to tsconfig "include"; keep the file as it was.
  cp tsconfig.json "$TMPDIR/tsconfig.check.bak" 2>/dev/null || cp tsconfig.json /tmp/tsconfig.check.bak
  run "next build" env NEXT_DIST_DIR=.next-check bun run build
  cp "${TMPDIR:-/tmp}/tsconfig.check.bak" tsconfig.json 2>/dev/null || cp /tmp/tsconfig.check.bak tsconfig.json
  rm -rf .next-check
else
  printf '▷ next build skipped (--fast)\n'
fi
printf '\nAll checks passed.\n'
