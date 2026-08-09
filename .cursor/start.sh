#!/usr/bin/env bash
# Cloud Agent start phase (per boot). Bring the local PostgreSQL cluster online;
# the backend/Vite terminals depend on it. Idempotent and returns promptly.
set -euo pipefail

PG_VER="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $1}')"
PG_VER="${PG_VER:-16}"

if pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  echo "[start] PostgreSQL $PG_VER/main already online"
else
  echo "[start] starting PostgreSQL $PG_VER/main ..."
  sudo pg_ctlcluster "$PG_VER" main start || true
fi

# Wait briefly for the socket so dependent terminals connect cleanly.
for _ in $(seq 1 20); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "[start] PostgreSQL is ready"
    break
  fi
  sleep 1
done
