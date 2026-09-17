# Chess Club

Local-only manager for a workplace chess club. No accounts, no cloud: everything is stored in `data/db.json` next to the code,
with automatic daily snapshots in `data/backups/`.

## Run

```bash
bun install
bun run dev          # http://localhost:3000
bun run dev:lan      # also reachable from phones on the same Wi-Fi (URL shown on the Admin page)
```

## What it does

- **Players & Elo** – starting rating, W/D/L, form, streaks, rank movement, rating chart, rivals, head-to-head, and a
  random emoji avatar for everyone (changeable by the admin). Friendly games can be backdated; they slot into the Elo
  replay at that date.
  FIDE-style K factors (40 for the first 30 games, 20 afterwards, 10 above 2400). Ratings are always recomputed by
  replaying every game in order, so editing or deleting a result keeps everything consistent. Forfeits (+/−) count for
  standings but never for Elo.
- **Club night** – tick who is present, get random boards with balanced colors, play several rounds in one evening
  (nobody meets the same opponent twice that night), late arrivals join automatically against the bye, early leavers
  are removed, results are entered per board with undo.
- **Tournaments** – four formats:
  - *Random* and *Swiss*: automatic pairings, no rematches, color balancing (never three of the same color in a row),
    bye when odd, manual board editing before results are entered, withdrawals.
  - *Round robin*: Berger schedule, colors balanced, field fixed at start, withdrawn players' games become forfeits.
  - *Knockout*: bracket seeded by rating (byes for top seeds when the field is not a power of two), 1 or 2 games per
    match, automatic tiebreak game with swapped colors on a tie, optional 3rd-place match, bracket view and placement.
  Standings with configurable tiebreaks (Buchholz, Sonneborn-Berger, direct encounter, progressive, wins, wins with black),
  performance rating, crosstable, podium.
- **Club life** – the club has a name, motto, founding year, meeting place and a notice board (Admin → Club identity);
  they appear in the header and on the home page hero, together with a chess quote of the day. **Seasons** have their own table (1 point per
  win, ½ per draw across every game; playing more counts on purpose) and a champion crowned when the admin closes the
  season. **Titles** follow the rating from 10 games on: Club Player 1100, Expert 1300, Master 1500, Grandmaster 1700.
  **Achievements** (First Blood, Hat-trick, Giant Slayer, Perfect Night, Familiar Face, …) are derived from games and
  club nights and shown on profiles. The **Hall of Fame** collects season champions, tournament winners, player of the
  month, title holders, most decorated players and club records. The home page opens with a hero and "Around the club"
  highlights (upsets, streaks, climbers, new faces, the season race).
- **Look** – club mark (a drawn knight), serif display type, chessboard-textured hero, cartoon character avatars generated from
  a seed (hair, face, shirt and colours; unique per player, changeable by the admin), line icons and medal ranks.
- **Stats** – white/black/draw split, activity per month, rating race of the top players, monthly table (month champion),
  records (biggest upset, highest rating, longest streak).
- **Admin** – password-protected (salted scrypt hash in the JSON file, signed httpOnly cookie bound to that hash, so a
  new password signs every other admin device out). Only the admin can edit or
  delete players, rounds, tournaments and club nights, change settings, download/import the database, take, download,
  restore or delete a snapshot, merge two records of the same person, and bulk-delete from the **Danger zone** (whole
  club, history only, all tournaments, all club nights or all friendlies; a snapshot is taken first). **Sign out
  everyone** rotates the cookie secret so every device has to sign in again. An optional **owner password** (Admin → Owner
  password) puts a second lock on those destructive tools, for clubs where several people share the admin password: it is
  asked per action, the admin password alone cannot change it, and only the recovery token can reset it.
  Everyone can add players, pair and enter results. The admin sign-in lives at `/admin` (no link in the header until
  signed in). An **activity log** on the Admin page lists every result, pairing and
  edit with a timestamp and whether it was done while signed in as admin, so changes made from phones on the network can be
  traced; it can be searched and filtered by admin/guest. A **Data health** card runs the same consistency checks as the
  `inspect-db` skill (dangling references, misplaced games, rating drift) on every visit. A **QR code** of the current address lets phones open the
  club without typing.
- **Member code** – optional single shared code for the whole club (Admin → Member code), like a Wi-Fi password. Five wrong
  codes (or admin passwords, or PINs) in a row lock that secret for ten minutes.
  When set, visitors see a join screen once and the device is remembered for 90 days; changing the code signs everyone
  out, turning it off reopens the club. Admins pass regardless. Meant for a public deployment; leave it off on the
  office network.
- **Who are you?** – accounts without logins. A device's first visit lands on a welcome screen: pick your face, or join
  with your name and a four-digit PIN, or *Just browsing* (asked again after a month). Later the same screen is under
  *Who are you?* in the header. A player picks their face and enters their four-digit PIN (chosen the first time the profile is claimed). The device then remembers them for a year: their name and
  avatar sit in the header, their row is marked *you*, and only they (or the admin) can change their avatar or PIN. Five
  wrong PINs lock it for ten minutes. Forgot the PIN? The admin sets a new one on the player's page, or clears it so the
  player picks a fresh one. Nobody but the admin can edit or delete a player.
  Newcomers add themselves once (*Join the club* on the Players page: name + PIN, the device is theirs immediately);
  once a device knows a player, that form is gone. Only the admin can add other people.
- **Validation messages** (wrong pairing, round not finished, duplicate name, …) show up as a toast on the page you were on,
  in development and in production builds alike.

## Check

```bash
bun test             # unit tests for Elo, pairings, standings, migrations and backups
bunx tsc --noEmit
bun run lint
bun run build
```

## Deploying to Vercel (optional)

Locally the club is a JSON file. On Vercel the filesystem is read-only, so the same app stores everything in Postgres
when `DATABASE_URL` is set. Nothing else changes: same pages, same admin, same import/export.

1. Push the repo to GitHub and import it in Vercel (framework: Next.js, Bun is detected from `bun.lock`).
2. In the Vercel project, open **Storage → Create Database → Neon** (free tier) and connect it. This adds
   `DATABASE_URL` to the environment automatically. Any other Postgres works too: set `DATABASE_URL` by hand.
3. Deploy. On the first request the app creates the `club_state` and `club_snapshots` tables itself.
4. Open `/admin` on the deployed site, create the admin password, then **Import a database file** and upload your local
   `data/db.json` to carry the club over. Daily snapshots now live in the database and are listed on the same page.
5. Set a **Member code** on the Admin page and share it with the club, so the public address is not an open door.

Concurrency: writes are versioned, so two people entering results at the same moment cannot overwrite each other.

## Data & backup

- `data/db.json` is the whole club (local mode). Copy it anywhere for a backup, or use **Admin → Download**, which works
  in both storage modes.
- One snapshot per day is written to `data/backups/` (the newest 30 files are kept, including the copies taken before an
  import, restore or reset and the ones you save by hand on the Admin page). Download, restore or delete them from the
  Admin page.
- Set `CHESS_DATA_DIR=/some/folder` to run against a different data folder (e.g. a second club or a test copy).
- Forgot the admin password? Set `ADMIN_RESET_TOKEN` to a long random string in the server environment (Vercel:
  Settings → Environment Variables, then redeploy; locally `.env.local`), open `/admin` → *Forgot the password?*, choose admin or
  owner password, enter the token and a new password, then remove the variable again. Locally you can also delete the `adminPasswordHash`
  field from `data/db.json`.
