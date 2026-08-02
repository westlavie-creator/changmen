#!/usr/bin/env bash
# Core tarball deploy (called by deploy-shanghai.sh / deploy-hongkong.sh)
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_REPO="${DEPLOY_REPO:-/root/changmen}"
DEPLOY_LOCAL_BUILD="${DEPLOY_LOCAL_BUILD:-1}"
DEPLOY_FULL="${DEPLOY_FULL:-}"
SSH_RETRIES="${SSH_RETRIES:-3}"
REMOTE_DEPLOY_SCRIPTS="${REMOTE_DEPLOY_SCRIPTS:-/tmp/changmen-deploy}"
REPO_ARCHIVE="${TMPDIR:-/tmp}/changmen-repo.tgz"
DIST_ARCHIVE="${TMPDIR:-/tmp}/changmen-dist.tgz"
API_CONTRACT_PKG="${ROOT}/node_modules/@changmen/api-contract/package.json"

load_deploy_local

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  echo "ERROR: DEPLOY_HOST not set. Use deploy-shanghai.sh or deploy-hongkong.sh" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1 || ! command -v scp >/dev/null 2>&1; then
  echo "ERROR: ssh/scp not found." >&2
  exit 1
fi

APPLY_SCRIPT="${ROOT}/deploy/scripts/apply-repo-archive.sh"
DEPLOY_REMOTE="${ROOT}/deploy/scripts/deploy-server-remote.sh"
REMOTE_APP="${DEPLOY_REPO}/client/web"

if [[ ! -f "${APPLY_SCRIPT}" || ! -f "${DEPLOY_REMOTE}" ]]; then
  echo "ERROR: missing deploy scripts under deploy/scripts/" >&2
  exit 1
fi

ssh_opts
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

echo
echo "========================================"
echo "  Deploy changmen tarball to VPS"
echo "========================================"
echo "  Target: ${REMOTE}"
echo "  Repo:   ${DEPLOY_REPO}"
echo "  LOCAL_BUILD: ${DEPLOY_LOCAL_BUILD}"
echo

if [[ "${DEPLOY_LOCAL_BUILD}" == "1" ]]; then
  if port_listening "${BACKEND_PORT}"; then
    echo "WARN: port ${BACKEND_PORT} in use — close sh/dev.sh if npm ci fails"
  fi
  if port_listening "${VITE_PORT}"; then
    echo "WARN: port ${VITE_PORT} in use — close sh/dev.sh if npm ci fails"
  fi

  echo "[1/5] npm ci"
  pushd "${ROOT}" >/dev/null
  attempt=0
  until npm ci; do
    attempt=$((attempt + 1))
    if (( attempt >= 3 )); then
      popd >/dev/null
      echo "ERROR: npm ci failed" >&2
      exit 1
    fi
    echo "WARN: npm ci failed (attempt ${attempt}/3), retrying..."
    sleep 3
  done
  if [[ ! -f "${API_CONTRACT_PKG}" ]]; then
    popd >/dev/null
    echo "ERROR: broken workspace link after npm ci" >&2
    exit 1
  fi
  echo "[2/5] local app:build"
  npm run app:build
  popd >/dev/null
  if [[ ! -f "${ROOT}/client/web/dist/index.html" ]]; then
    echo "ERROR: missing client/web/dist/index.html after build" >&2
    exit 1
  fi
fi

echo "[3/5] pack app archive"
rm -f "${REPO_ARCHIVE}"
tar -C "${ROOT}" -czf "${REPO_ARCHIVE}" \
  --exclude=node_modules \
  --exclude=client/web/dist \
  --exclude=client/web/node_modules \
  --exclude=.git \
  .
if [[ "${DEPLOY_LOCAL_BUILD}" == "1" ]]; then
  rm -f "${DIST_ARCHIVE}"
  tar -C "${ROOT}/client/web/dist" -czf "${DIST_ARCHIVE}" .
fi

echo "[4/5] upload archive + deploy scripts"
upload_ok=0
for ((attempt = 1; attempt <= SSH_RETRIES; attempt++)); do
  if scp "${SSH_OPTS[@]}" "${REPO_ARCHIVE}" "${REMOTE}:/tmp/changmen-repo.upload.tgz" \
    && ssh "${SSH_OPTS[@]}" "${REMOTE}" "mkdir -p ${REMOTE_DEPLOY_SCRIPTS}" \
    && scp "${SSH_OPTS[@]}" "${APPLY_SCRIPT}" "${DEPLOY_REMOTE}" "${REMOTE}:${REMOTE_DEPLOY_SCRIPTS}/" \
    && ssh "${SSH_OPTS[@]}" "${REMOTE}" "sed -i 's/\r$//' ${REMOTE_DEPLOY_SCRIPTS}/apply-repo-archive.sh ${REMOTE_DEPLOY_SCRIPTS}/deploy-server-remote.sh"; then
    upload_ok=1
    break
  fi
  echo "SSH/SCP failed (attempt ${attempt}/${SSH_RETRIES}), retry in 5s"
  sleep 5
done
if [[ "${upload_ok}" != "1" ]]; then
  echo "ERROR: upload failed" >&2
  exit 1
fi

if [[ "${DEPLOY_FULL}" == "1" ]]; then
  DEPLOY_FULL_FLAG=1
else
  DEPLOY_FULL_FLAG=0
fi

echo "[5/5] apply archive on VPS"
ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "set -e; mv /tmp/changmen-repo.upload.tgz /tmp/changmen-repo.tgz; gzip -t /tmp/changmen-repo.tgz; if [ ! -d ${DEPLOY_REPO}/server/backend ] && [ -d /root/gamebet ]; then mv /root/gamebet ${DEPLOY_REPO}; fi; DEPLOY_REPO=${DEPLOY_REPO} CHANGMEN_DEPLOY_SCRIPTS=${REMOTE_DEPLOY_SCRIPTS} DEPLOY_SKIP_APP_BUILD=1 DEPLOY_SKIP_POSTCHECK=1 DEPLOY_FULL=${DEPLOY_FULL_FLAG} bash ${REMOTE_DEPLOY_SCRIPTS}/apply-repo-archive.sh /tmp/changmen-repo.tgz"

if [[ "${DEPLOY_LOCAL_BUILD}" == "1" ]]; then
  echo "Upload frontend dist"
  scp "${SSH_OPTS[@]}" "${DIST_ARCHIVE}" "${REMOTE}:/tmp/changmen-dist.tgz"
  ssh "${SSH_OPTS[@]}" "${REMOTE}" \
    "set -euo pipefail; archive=/tmp/changmen-dist.tgz; app=${REMOTE_APP}; tmp=\"\$app/dist.upload.\$\$\"; tar -tzf \"\$archive\" >/dev/null; rm -rf \"\$tmp\"; mkdir -p \"\$tmp\"; tar -xzf \"\$archive\" -C \"\$tmp\"; test -f \"\$tmp/index.html\"; test -d \"\$tmp/assets\"; rm -rf \"\$app/dist.prev\"; if [ -d \"\$app/dist\" ]; then mv \"\$app/dist\" \"\$app/dist.prev\"; fi; mv \"\$tmp\" \"\$app/dist\"; rm -rf \"\$app/dist.prev\" \"\$archive\"; chmod -R a+rX \"\$app/dist\""
fi

if [[ "${DEPLOY_SKIP_TELEGRAM_CHECK:-}" == "1" ]]; then
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "cd ${DEPLOY_REPO}/server/backend && node scripts/ops/diagnostics/post-deploy-check.mjs --skip-telegram"
else
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "cd ${DEPLOY_REPO}/server/backend && node scripts/ops/diagnostics/post-deploy-check.mjs"
fi

if ! ssh "${SSH_OPTS[@]}" "${REMOTE}" "curl -sf -o /dev/null http://127.0.0.1:3456/ || curl -sf -o /dev/null http://127.0.0.1/"; then
  echo "WARN: homepage check failed"
fi

echo
echo "Done. Open http://${DEPLOY_HOST}/"
