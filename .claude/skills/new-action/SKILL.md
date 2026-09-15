---
name: new-action
description: Add or change a server action in src/lib/actions.ts the way this repo does it (run/attempt wrapper, requireAdmin, UserError, mutate + log + recomputeRatings/syncKnockout, revalidateAll). Use whenever a feature needs a new mutation, a new form submit, or a new button that changes data.
---

# Adding a server action

Every mutation lives in `src/lib/actions.ts` (`"use server"`). Follow the existing shape exactly; `addPlayer` and `setGameResult` are the two reference examples.

## Template

```ts
export async function doThing(id: string, fd: FormData) {
  return run(async () => {                 // form action  → redirects back with ?flash= on UserError
  // return attempt(async () => {          // called from a client component → returns { error }
    await requireAdmin();                  // destructive / admin-only. Omit for member actions.
    const { t } = await getT();            // BEFORE mutate(): its callback is synchronous
    const name = str(fd, "name");          // str()/num() helpers; never fd.get() directly
    if (!name) throw new UserError(t.errors.nameRequired);
    await mutate((db) => {
      const t = db.tournaments.find((x) => x.id === id);
      if (!t) throw new UserError(t.errors.tournamentNotFound); // message keys live in src/lib/i18n/messages/errors.ts (en + de)
      // ... change db in place ...
      log(db, `Tournament ${t.name}: thing done`);   // inside mutate, past tense, names not ids
      if (t.knockout) syncKnockout(db, t);           // from src/lib/knockout.ts, whenever games/results of a knockout change
      recomputeRatings(db);                          // whenever a game, result, rated flag or player changes
    });
    revalidateAll();
  });
}
```

## Rules

- **Wrapper is mandatory.** `run()` for `<form action={...}>` and `.bind()`ed form actions; `attempt()` when a client component calls it and shows the error itself (see `ResultButtons`, `ConfirmButton`). Never export an unwrapped function.
- **`UserError` vs `Error`.** Anything a person should read (validation, "finish the round first", not found) is `UserError`, with the text from `t.errors.*` so it shows in the device's language (`fmt()` for placeholders). `log()` texts stay English. A plain `Error` is a bug and lands in `error.tsx`.
- **Authorization inside the action**, never only in the UI: `requireAdmin()` for admin-only; for self-only actions compare `await currentPlayerId()` with the target id and allow admin as well (see `setAvatar`, `changeOwnPin`).
- **One `mutate()` per action.** All reads-then-writes happen inside the callback so the version-conflict retry can replay it. Do not `await readDb()` and then `mutate()` on stale data for the decision.
- **Never touch `rating`, `gamesPlayed`, `wins/draws/losses` by hand.** Call `recomputeRatings(db)` at the end of the mutate.
- **`log(db, text)`** inside the same mutate, one line, human readable, using `nameOf()`/`whereOf()`.
- **New game objects** go through `makeGame(db, {...})` from `src/lib/games.ts` so `seq`, ids and rating fields are right.
- **Dates from forms** go through `playedAt()`; results through `parseResult()`.
- **Finish with `revalidateAll()`**; only `redirect()` when the page the user is on no longer exists (e.g. after deleting the entity they were viewing).

## Wiring it up

- Form: `<form action={doThing.bind(null, id)}>` in a server component; use `SubmitButton` for pending state, `ConfirmButton` for destructive buttons.
- Client component: `const { error } = await doThing(id, fd); if (error) toast(error)` — see how `ResultButtons` uses `Toast`.
- If a new field is added to `types.ts`, also update `migrate()` in `db.ts` (default for old files) and `src/lib/__tests__/fixtures.ts`.
- Add a unit test for any new pure logic you extracted into `queries.ts`/`pairing.ts`/`club.ts` (see the `write-test` skill), then run the `check` skill.
