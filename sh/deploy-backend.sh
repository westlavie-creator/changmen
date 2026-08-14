#!/usr/bin/env bash
# Step 5: backend-only deploy — repo archive + pm2; does NOT rebuild/replace dist.
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_REPO="${DEPLOY_REPO:-/root/changmen}"
DEPLOY_FULL="${DEPLOY_FULL:-}"
SSH_RETRIES="${SSH_RETRIES:-3}"
REMOTE_DEPLOY_SCRIPTS="${REMOTE_DEPLOY_SCRIPTS:-/tmp/changmen-deploy}"
REPO_ARCHIVE="${TMPDIR:-/tmp}/changmen-repo-be.tgz"

load_deploy_local
ssh_opts

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  echo "ERROR: DEPLOY_HOST not set (sh/deploy-server.local.sh)" >&2
  exit 1
fi

APPLY_SCRIPT="${ROOT}/deploy/scripts/apply-repo-archive.sh"
DEPLOY_REMOTE="${ROOT}/deploy/scripts/deploy-server-remote.sh"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

echo
echo "========================================"
echo "  Deploy BACKEND only (pm2, keep dist)"
echo "========================================"
echo "  Target: ${REMOTE}"
echo

cd "${ROOT}"
rm -f "${REPO_ARCHIVE}"
node --input-type=module -e "import { packGitRepoArchive } from './scripts/deploy/pack-git-repo.mjs'; packGitRepoArchive(process.cwd(), process.argv[1])" "${REPO_ARCHIVE}"

upload_ok=0
for ((attempt = 1; attempt <= SSH_RETRIES; attempt++)); do
  if scp "${SSH_OPTS[@]}" "${REPO_ARCHIVE}" "${REMOTE}:/tmp/changmen-repo.upload.tgz" \
    && ssh "${SSH_OPTS[@]}" "${REMOTE}" "mkdir -p ${REMOTE_DEPLOY_SCRIPTS}" \
    && scp "${SSH_OPTS[@]}" "${APPLY_SCRIPT}" "${DEPLOY_REMOTE}" \
      "${ROOT}/deploy/scripts/sync-hk-relay-env-remote.sh" \
      "${REMOTE}:${REMOTE_DEPLOY_SCRIPTS}/" \
    && ssh "${SSH_OPTS[@]}" "${REMOTE}" "sed -i 's/\r$//' ${REMOTE_DEPLOY_SCRIPTS}/*.sh"; then
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

DEPLOY_FULL_FLAG=0
[[ "${DEPLOY_FULL}" == "1" ]] && DEPLOY_FULL_FLAG=1

ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "set -euo pipefail
   mv /tmp/changmen-repo.upload.tgz /tmp/changmen-repo.tgz
   gzip -t /tmp/changmen-repo.tgz
   export DEPLOY_REPO=${DEPLOY_REPO} CHANGMEN_DEPLOY_SCRIPTS=${REMOTE_DEPLOY_SCRIPTS} DEPLOY_SKIP_APP_BUILD=1 DEPLOY_SKIP_POSTCHECK=0 DEPLOY_FULL=${DEPLOY_FULL_FLAG}
   bash ${REMOTE_DEPLOY_SCRIPTS}/apply-repo-archive.sh /tmp/changmen-repo.tgz"

echo
echo "Done. Backend restarted; frontend dist left as-is."
