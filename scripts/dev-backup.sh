#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR=${1:-./backups}
mkdir -p "$OUT_DIR"

POSTGRES_CONTAINER=$(docker compose ps -q postgres)
if [[ -z "$POSTGRES_CONTAINER" ]]; then
  echo "postgres container is not running"
  exit 1
fi

docker exec "$POSTGRES_CONTAINER" pg_dump -U "${POSTGRES_USER:-chronicle}" "${POSTGRES_DB:-chronicle}" > "$OUT_DIR/chronicle-db-$STAMP.sql"

echo "Backup written to $OUT_DIR/chronicle-db-$STAMP.sql"
