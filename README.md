# Black Market rotation

Rotates which crates/abilities/skins are "in stock" in Firebase every 12 hours,
via a GitHub Actions cron job — no server needed, works fine with GitHub Pages.

## Setup (one-time)

1. **Copy this whole `blackmarket-rotation/` folder** (including the hidden
   `.github/workflows/` folder inside it) into the root of your `undefined`
   repo, then commit + push. GitHub only looks for workflows under
   `.github/workflows/` at the repo root, so if this folder isn't at the
   top level, move `.github/workflows/rotate-blackmarket.yml` to your repo's
   real `.github/workflows/` and keep `rotate-blackmarket.mjs` +
   `package.json` wherever's convenient (update the `working-directory` in
   the workflow file to match).

2. **Get a Firebase service account key**
   Firebase console → Project settings (gear icon) → Service accounts →
   "Generate new private key". This downloads a JSON file — keep it secret,
   it has full admin access to your database.

3. **Add two GitHub repo secrets**
   Repo → Settings → Secrets and variables → Actions → New repository secret:
   - `FIREBASE_DATABASE_URL` — your Realtime Database URL, looks like
     `https://YOUR-PROJECT-default-rtdb.firebaseio.com`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the **entire contents** of the
     downloaded JSON key file as-is (it's fine if it's multi-line).

4. **Test it manually** — repo → Actions tab → "Rotate Black Market" →
   "Run workflow". Check your Firebase console afterward; `blackMarket/items`
   should have fresh contents and `blackMarket/date` should be a recent
   timestamp.

After that it just runs itself at 00:00 and 12:00 UTC daily.

## Keeping the item pool in sync

`rotate-blackmarket.mjs` has its own hardcoded list of crate/ability/skin ids
(`CRATE_IDS`, `ABILITY_IDS`, `SKIN_IDS`) — it doesn't read `index.html`. If you
add a new crate, ability, or buyable skin to the game later, add its id here
too, or the rotation will never pick it. The client's
`blackMarketAllPossibleIds()` function in `index.html` is the source of truth
for what a "complete" list looks like.

## Adjusting the odds

`COUNTS` at the top of the script controls how many of each type get put in
stock per rotation (default: 3 crates, 2 abilities, 6 skins). Change those
numbers, or edit `cron: '0 0,12 * * *'` in the workflow file to run more or
less often.
