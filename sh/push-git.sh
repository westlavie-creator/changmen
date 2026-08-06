#!/usr/bin/env bash
# Commit tracked changes (optional) and push master
set -euo pipefail
# shellcheck disable=SC1091
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
resolve_root

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found." >&2
  exit 1
fi

echo
echo "========================================"
echo "  Push to GitHub"
echo "========================================"
echo "  Repo: ${ROOT}"
echo

cd "${ROOT}"

if git diff --cached --quiet && git diff --quiet; then
  echo "No tracked changes — pushing existing commits only."
else
  COMMIT_MSG="${1:-}"
  if [[ -z "${COMMIT_MSG}" ]]; then
    read -r -p "Commit message (empty=deploy): " COMMIT_MSG || true
  fi
  COMMIT_MSG="${COMMIT_MSG:-deploy}"
  git add -u
  if ! git diff --cached --quiet; then
    git commit -m "${COMMIT_MSG}"
  fi
fi

git push -u origin master
echo
echo "Git push OK."
