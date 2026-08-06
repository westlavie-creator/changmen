# AGENTS.md

Repo-level guidance for automated agents. See `CLAUDE.md`, `LOCAL_DEV.md`, and
`docs/` for the full architecture/command reference; this file only records
durable, non-obvious operating notes.

## Cursor Cloud specific instructions

These notes describe how the changmen dev stack runs in a Cursor Cloud VM. The
update script only refreshes dependencies (`nvm install 22` + `npm install`);
everything below is startup/runtime context that is NOT handled automatically.

### Node version (critical)

The backend and `@changmen/*` workspaces import `.ts` files directly at runtime
(e.g. `@changmen/shared/**`), so Node must support TypeScript type-stripping,
i.e. **Node ≥ 22.18** (matches CI's `node-version: "22"`). The base image also
ships `/exec-daemon/node` = v22.14.0, which is too old and will fail with
`ERR_UNKNOWN_FILE_EXTENSION ".ts"`.

- A login shell (`bash -l`, which tmux and the `sh/` scripts use) already
  resolves `node` to nvm's Node 22 (`nvm alias default 22` is set). Prefer
  running services from a login shell.
- In a non-login shell `/exec-daemon/node` can shadow nvm. If you hit the `.ts`
  error, put nvm first: `export PATH="$(dirname "$(nvm which 22)")":$PATH`.

### Database: local PostgreSQL replaces RDS

Production uses Aliyun RDS (unreachable here). Dev setup created a local
PostgreSQL 16 instead:

- Role `gamebet_app` / password `gamebet_local_pw`, database `gamebet`.
- `server/backend/.env` (gitignored) points `DATABASE_URL` at
  `postgresql://gamebet_app:gamebet_local_pw@127.0.0.1:5432/gamebet` and sets a
  local `JWT_SECRET`.
- Start the DB if it isn't running: `sudo pg_ctlcluster 16 main start`
  (check with `pg_lsclusters`).

If a fresh VM is missing the DB, `.env`, or schema, recreate them:

1. Create role + db (`gamebet_app` / `gamebet`).
2. Write `server/backend/.env` (DATABASE_URL above + `AUTH_MODE=jwt`,
   `CHANGMEN_DB_SCRIPT=rds`, a ≥16-char `JWT_SECRET`, `DATABASE_SSL=0`).
3. Apply schema. `node scripts/apply-rds-schema.mjs` mostly works but migration
   `024_team_platform_maps_venue_columns.sql` fails on a fresh DB (its final
   `COMMENT ON COLUMN team_venue_maps.venue_id` — the baseline already ships the
   renamed `venue_team_id`; the renames themselves are guarded no-ops). Apply
   the migration list in `db/migrations/` in order, tolerating that one
   cosmetic failure. Also apply `034_platform_bets_market_id.sql` (the script's
   built-in list omits it, but the code queries `platform_bets.market_id`).
4. Create a login user:
   `node scripts/create-user.js --admin admin admin123456` (run from
   `server/backend`).

### Running the stack

Backend (port 3456) + Vite (port 5174); the matchMerge loop is embedded in the
backend, so no separate matcher process is needed for basic dev:

- Backend: from repo root, `PORT=3456 A8_AUTH=0 SKIP_APP_BUILD=1 npm run web`
  (or `./sh/dev-esport.sh`, which also starts Vite).
- Frontend: `VITE_DEV_PORT=5174 npm run app:dev`. Vite binds IPv6 `localhost`,
  so use `http://localhost:5174/` (not `127.0.0.1`). It proxies `/esport`,
  `/health`, etc. to the backend.
- Log in at `http://localhost:5174/` with `admin` / `admin123456`. In Vite dev
  mode the Chrome-extension gate and mTLS cert gate are auto-skipped.

### Expected benign noise in an isolated VM (no venue credentials / egress)

These are normal here and do not indicate a broken environment:

- `[ws_forward/*] upstream connect_error`, `[platform-sync] ... skip/failed`
  (no OB/RAY/PB/TF/Stake credentials).
- `[matcher] error: 拒绝空写（empty_without_ended）` — the match-composer guard
  when there is no collected match data.
- Creating a **venue betting account** through the UI fails with a "Network
  Error" because saving triggers a live balance refresh against the real venue
  gateway, which is unreachable without real credentials/egress. Auth,
  dashboard, and config/KV writes (e.g. `profiles.preferences`) still persist to
  the local DB.

### Lint / test / build

Standard commands live in the root `package.json` (`npm run lint`, `npm test`,
`npm run app:build`, `npm run test:backend`, `npm run test:frontend`). Note the
repo currently has many pre-existing `eslint` violations and a handful of
pre-existing frontend unit-test failures (Polymarket stake math, etc.); these
are unrelated to environment setup.
