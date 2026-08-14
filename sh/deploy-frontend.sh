#!/usr/bin/env bash
# Step 5: frontend-only deploy — local app:build + upload dist; does NOT pm2 restart.
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root
require_npm

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_REPO="${DEPLOY_REPO:-/root/changmen}"
DIST_ARCHIVE="${TMPDIR:-/tmp}/changmen-dist-fe.tgz"
REMOTE_APP="${DEPLOY_REPO}/client/web"

load_deploy_local
ssh_opts

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  echo "ERROR: DEPLOY_HOST not set (sh/deploy-server.local.sh)" >&2
  exit 1
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

echo
echo "========================================"
echo "  Deploy FRONTEND only (dist, no pm2)"
echo "========================================"
echo "  Target: ${REMOTE}"
echo

pushd "${ROOT}" >/dev/null
npm run app:build
popd >/dev/null
test -f "${ROOT}/client/web/dist/index.html"
if ! grep -Rql 'https://api.changmen.fun' "${ROOT}/client/web/dist/assets/"; then
  echo "ERROR: dist missing VITE_API_BASE https://api.changmen.fun (.env.production?)" >&2
  exit 1
fi

rm -f "${DIST_ARCHIVE}"
tar -C "${ROOT}/client/web/dist" -czf "${DIST_ARCHIVE}" .

scp "${SSH_OPTS[@]}" "${DIST_ARCHIVE}" "${REMOTE}:/tmp/changmen-dist-fe.tgz"
ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "set -euo pipefail
   archive=/tmp/changmen-dist-fe.tgz
   app=${REMOTE_APP}
   tmp=\"\$app/dist.upload.\$\$\"
   tar -tzf \"\$archive\" >/dev/null
   rm -rf \"\$tmp\"
   mkdir -p \"\$tmp\"
   tar -xzf \"\$archive\" -C \"\$tmp\"
   test -f \"\$tmp/index.html\"
   test -d \"\$tmp/assets\"
   rm -rf \"\$app/dist.prev\"
   if [ -d \"\$app/dist\" ]; then mv \"\$app/dist\" \"\$app/dist.prev\"; fi
   mv \"\$tmp\" \"\$app/dist\"
   rm -rf \"\$app/dist.prev\" \"\$archive\"
   chmod -R a+rX \"\$app/dist\"
   echo 'OK frontend-only; pm2 untouched'"

echo
echo "Done. Frontend updated; backend processes not restarted."
