#!/usr/bin/env bash
# Piped from BAT/deploy-server.bat (bash -s) or run on VPS after git pull.
set -euo pipefail

ROOT="${DEPLOY_REPO:?DEPLOY_REPO is required}"
PM2_WEB="${PM2_WEB:-gamebet-web}"
PM2_MATCHER="${PM2_MATCHER:-gamebet-matcher}"
PM2_PM_SPORTS="${PM2_PM_SPORTS:-gamebet-pm-sports}"
DEPLOY_FULL="${DEPLOY_FULL:-0}"
DEPLOY_SKIP_APP_BUILD="${DEPLOY_SKIP_APP_BUILD:-0}"
MATCHER_EMBEDDED="${MATCHER_EMBEDDED:-1}"
MATCHER_STANDALONE="${MATCHER_STANDALONE:-0}"
export MATCHER_EMBEDDED MATCHER_STANDALONE

t0=$SECONDS
log() { echo "==> $*"; }
elapsed() { echo "==> done in $((SECONDS - t0))s total"; }

if [ -f "$ROOT/changmen/package.json" ]; then
  GIT_ROOT="$ROOT"
  CHANGMEN="$ROOT/changmen"
elif [ -f "$ROOT/package.json" ] && [ -d "$ROOT/server/backend" ]; then
  GIT_ROOT="$ROOT"
  CHANGMEN="$ROOT"
else
  echo "ERROR: changmen not found under DEPLOY_REPO=$ROOT"
  exit 1
fi

log "git root: $GIT_ROOT"
log "changmen: $CHANGMEN"

cd "$GIT_ROOT"
if [ ! -d .git ]; then
  echo "ERROR: $GIT_ROOT is not a git repo."
  exit 1
fi

discard_deploy_drift() {
  local p
  for p in changmen/package-lock.json package-lock.json; do
    if [ -e "$p" ] && ! git diff --quiet -- "$p" 2>/dev/null; then
      log "discard local drift: $p"
      git checkout -- "$p" 2>/dev/null || git restore -- "$p" 2>/dev/null || true
    fi
  done
}

pull_repo() {
  discard_deploy_drift
  if git pull --ff-only; then
    return 0
  fi
  log "git pull failed, fetch and reset to origin (VPS should match remote)"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git fetch origin
  git reset --hard "origin/${branch}"
}

OLD_HEAD="$(git rev-parse HEAD)"
pull_repo
NEW_HEAD="$(git rev-parse HEAD)"

# bash 启动时已读入旧脚本；pull 后 re-exec 一次，用新脚本跑迁移（保留 OLD/NEW 供 diff）
if [ -z "${DEPLOY_REEXEC:-}" ]; then
  export DEPLOY_REEXEC=1
  export DEPLOY_OLD_HEAD="$OLD_HEAD"
  export DEPLOY_NEW_HEAD="$NEW_HEAD"
  exec env DEPLOY_REEXEC=1 DEPLOY_OLD_HEAD="$OLD_HEAD" DEPLOY_NEW_HEAD="$NEW_HEAD" \
    DEPLOY_REPO="$ROOT" DEPLOY_FULL="$DEPLOY_FULL" DEPLOY_SKIP_APP_BUILD="$DEPLOY_SKIP_APP_BUILD" \
    MATCHER_EMBEDDED="$MATCHER_EMBEDDED" MATCHER_STANDALONE="$MATCHER_STANDALONE" \
    PM2_WEB="$PM2_WEB" PM2_MATCHER="$PM2_MATCHER" PM2_PM_SPORTS="$PM2_PM_SPORTS" \
    bash "$GIT_ROOT/changmen/scripts/deploy-server-remote.sh"
fi
if [ -n "${DEPLOY_OLD_HEAD:-}" ] && [ -n "${DEPLOY_NEW_HEAD:-}" ]; then
  OLD_HEAD="$DEPLOY_OLD_HEAD"
  NEW_HEAD="$DEPLOY_NEW_HEAD"
fi

DO_INSTALL_ROOT=0
DO_INSTALL_FRONTEND=0
DO_APP_BUILD=0
DO_COMPILE_ROUTER=0
DO_PM2_WEB=0
DO_PM2_MATCHER=0
DO_PM2_PM_SPORTS=0
NEED_DIST_UPLOAD=0

enable_matcher_restart_if_standalone() {
  if [ "$MATCHER_STANDALONE" = "1" ]; then
    DO_PM2_MATCHER=1
  fi
  return 0
}

classify() {
  local raw="$1"
  local p="${raw#changmen/}"

  case "$p" in
    package.json|package-lock.json)
      DO_INSTALL_ROOT=1
      DO_PM2_WEB=1
      enable_matcher_restart_if_standalone
      ;;
    packages/shared/*|packages/api-contract/*|client/platform-adapter/*)
      DO_INSTALL_ROOT=1
      DO_INSTALL_FRONTEND=1
      DO_APP_BUILD=1
      DO_PM2_WEB=1
      enable_matcher_restart_if_standalone
      ;;
    server/db/*|server/match-engine/*|devtools/platform-probes/*|server/team-resolver/*)
      DO_INSTALL_ROOT=1
      DO_PM2_WEB=1
      enable_matcher_restart_if_standalone
      ;;
    server/polymarket-sports/*|server/realtime-hub/*)
      DO_INSTALL_ROOT=1
      DO_PM2_WEB=1
      DO_PM2_PM_SPORTS=1
      ;;
    server/backend/*)
      DO_INSTALL_ROOT=1
      DO_PM2_WEB=1
      DO_COMPILE_ROUTER=1
      ;;
    server/matcher/*)
      DO_INSTALL_ROOT=1
      DO_PM2_WEB=1
      enable_matcher_restart_if_standalone
      ;;
    client/web/*)
      DO_INSTALL_FRONTEND=1
      DO_APP_BUILD=1
      ;;
    .github/workflows/*|client/chrome-extension/*|BAT/*|scripts/deploy-server-remote.sh|scripts/README.md|PRODUCTION_DEPLOYMENT.md)
      ;;
    ecosystem.config.cjs)
      DO_PM2_WEB=1
      enable_matcher_restart_if_standalone
      ;;
    *.md|.gitignore)
      ;;
    *)
      log "unknown change: $raw (running full deploy for safety)"
      DO_INSTALL_ROOT=1
      DO_INSTALL_FRONTEND=1
      DO_APP_BUILD=1
      DO_PM2_WEB=1
      enable_matcher_restart_if_standalone
      ;;
  esac
  return 0
}

if [ "$DEPLOY_FULL" = "1" ]; then
  DO_INSTALL_ROOT=1
  DO_INSTALL_FRONTEND=1
  DO_APP_BUILD=1
  DO_COMPILE_ROUTER=1
  DO_PM2_WEB=1
  enable_matcher_restart_if_standalone
  DO_PM2_PM_SPORTS=1
elif [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  log "already up to date, skip install/build"
else
  while IFS= read -r path; do
    if [ -n "$path" ]; then
      classify "$path"
    fi
  done < <(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")
fi

if [ "$DEPLOY_SKIP_APP_BUILD" = "1" ] && [ "$DO_APP_BUILD" = "1" ]; then
  NEED_DIST_UPLOAD=1
fi
if [ "$DEPLOY_SKIP_APP_BUILD" = "1" ]; then
  DO_APP_BUILD=0
fi

cd "$CHANGMEN"
DIST_UPLOAD_MARKER="$CHANGMEN/client/web/.deploy-needs-dist-upload"
rm -f "$DIST_UPLOAD_MARKER"
if [ "$NEED_DIST_UPLOAD" = "1" ]; then
  log "frontend changed; local dist upload required"
  printf '%s\n' "$NEW_HEAD" > "$DIST_UPLOAD_MARKER"
else
  log "frontend dist upload not required"
fi

if [ "$DO_INSTALL_ROOT" = "1" ] || [ "$DO_INSTALL_FRONTEND" = "1" ]; then
  log "npm install (changmen workspaces)"
  npm install
fi

if [ "$DO_APP_BUILD" = "1" ]; then
  log "app:build (slow on VPS; set DEPLOY_LOCAL_BUILD=1 in deploy-server.local.bat to build on PC)"
  npm run app:build
else
  log "skip app:build"
fi

if [ "$DO_COMPILE_ROUTER" = "1" ]; then
  log "compile:router (router.js is gitignored; must match router.ts on VPS)"
  npm run compile:router --workspace=@changmen/backend
else
  log "skip compile:router"
fi

LIVE_TIMER_TOUCHED=0
RDS_SCHEMA_TOUCHED=0
PLAYERS_RDS_TOUCHED=0
PLAYERS_OWNER_MIGRATION_TOUCHED=0
if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
  while IFS= read -r path; do
    case "$path" in
      changmen/server/backend/db/migrations/*|server/backend/db/migrations/*)
        RDS_SCHEMA_TOUCHED=1
        ;;
      *026_players_owner_user_id*|*027_players_active_owner*|*migrate-players-owner*|*finalize-players-owner*)
        PLAYERS_OWNER_MIGRATION_TOUCHED=1
        ;;
      *live_timer*|changmen/server/db/impl_rds.js|server/db/impl_rds.js)
        LIVE_TIMER_TOUCHED=1
        ;;
      *028_players_account*|*migrate-accounts-jsonb*|*player_account_record*)
        PLAYERS_RDS_TOUCHED=1
        ;;
      *006_tag_platforms_players*|*players_json_migrate*|changmen/server/backend/core/account/account_store.js|server/backend/core/account/account_store.js|changmen/server/db/rds/player_store.js|server/db/rds/player_store.js|changmen/server/backend/core/db/store.js|server/backend/core/db/store.js)
        PLAYERS_RDS_TOUCHED=1
        PLAYERS_OWNER_MIGRATION_TOUCHED=1
        ;;
    esac
  done < <(git -C "$GIT_ROOT" diff --name-only "$OLD_HEAD" "$NEW_HEAD")
fi
if [ "$LIVE_TIMER_TOUCHED" = "1" ]; then
  log "live_timer code changed — purge stale OB live_timers rows"
  node server/backend/scripts/purge-platform-live-timers.mjs OB || echo "WARN: purge live_timers failed"
fi
# owner 回填必须在 027 CHECK 之前（否则 apply-rds-schema 因 orphan player 失败）
if [ "$PLAYERS_OWNER_MIGRATION_TOUCHED" = "1" ] || [ "$RDS_SCHEMA_TOUCHED" = "1" ] || [ "$PLAYERS_RDS_TOUCHED" = "1" ] || [ "$DEPLOY_FULL" = "1" ]; then
  log "profiles.accounts backup (pre-migration)"
  (cd server/backend && node scripts/backup-profiles-accounts.mjs) || {
    echo "FAIL: backup-profiles-accounts — 中止 deploy 以免无回滚点"
    exit 1
  }
  log "players owner_user_id: backfill + finalize (pre-027)"
  (cd server/backend && node scripts/migrate-players-owner-user-id.mjs) || echo "WARN: migrate-players-owner failed"
  (cd server/backend && node scripts/finalize-players-owner-user-id.mjs) || {
    echo "FAIL: finalize-players-owner — 勿 apply 027，请人工处理 orphan players"
    exit 1
  }
fi
if [ "$RDS_SCHEMA_TOUCHED" = "1" ] || [ "$PLAYERS_RDS_TOUCHED" = "1" ] || [ "$DEPLOY_FULL" = "1" ]; then
  log "RDS schema: apply migrations"
  (cd server/backend && node scripts/apply-rds-schema.mjs)
fi
if [ "$PLAYERS_RDS_TOUCHED" = "1" ] || [ "$DEPLOY_FULL" = "1" ]; then
  log "profiles.accounts → players.account_data backfill"
  (cd server/backend && node scripts/migrate-accounts-jsonb-to-players.mjs) || {
    echo "FAIL: migrate-accounts-jsonb-to-players"
    exit 1
  }
fi
if [ "$PLAYERS_RDS_TOUCHED" = "1" ] || [ "$DEPLOY_FULL" = "1" ]; then
  log "players/tag_platforms → RDS: migrate JSON from storage/"
  (cd server/backend && node scripts/migrate-players-to-rds.mjs) || echo "WARN: migrate-players failed"
fi

if command -v pm2 >/dev/null 2>&1; then
  if [ "$MATCHER_EMBEDDED" = "1" ] && [ "$MATCHER_STANDALONE" != "1" ]; then
    log "embedded matcher enabled; stop standalone ${PM2_MATCHER} if present"
    pm2 stop "$PM2_MATCHER" >/dev/null 2>&1 || true
  fi
  PM2_TARGETS=()
  if [ "$DO_PM2_WEB" = "1" ]; then
    PM2_TARGETS+=("$PM2_WEB")
  fi
  if [ "$MATCHER_STANDALONE" = "1" ] && [ "$DO_PM2_MATCHER" = "1" ]; then
    PM2_TARGETS+=("$PM2_MATCHER")
  fi
  if [ "$DO_PM2_PM_SPORTS" = "1" ]; then
    PM2_TARGETS+=("$PM2_PM_SPORTS")
  fi
  if [ "${#PM2_TARGETS[@]}" -gt 0 ]; then
    log "pm2 restart ${PM2_TARGETS[*]}"
    pm2 restart "${PM2_TARGETS[@]}" --update-env
    pm2 status
  else
    log "skip pm2 restart"
  fi
else
  echo "WARN: pm2 not found, skip restart"
fi

if [ "$DO_PM2_WEB" = "1" ] || [ "$DEPLOY_FULL" = "1" ]; then
  log "post-deploy check (orders upsert + admin telegram)"
  (cd server/backend && node scripts/post-deploy-check.mjs)
  log "post-deploy check passed"
  if [ "$MATCHER_EMBEDDED" = "1" ]; then
    log "wait embedded matcher heartbeat"
    for i in $(seq 1 45); do
      if node --input-type=module -e "import { isMatcherRunning, readMatcherHeartbeat } from './server/matcher/lib/heartbeat.js'; const hb = readMatcherHeartbeat(); if (hb?.mode === 'embedded' && isMatcherRunning(hb)) process.exit(0); process.exit(1);"; then
        log "embedded matcher heartbeat ok"
        break
      fi
      if [ "$i" = "45" ]; then
        echo "ERROR: embedded matcher heartbeat not ready"
        node --input-type=module -e "import { readMatcherHeartbeat } from './server/matcher/lib/heartbeat.js'; console.error('heartbeat:', JSON.stringify(readMatcherHeartbeat()));" || true
        pm2 logs "$PM2_WEB" --lines 40 --nostream 2>/dev/null || true
        exit 1
      fi
      sleep 3
    done
  fi
fi

log "deploy done"
elapsed
