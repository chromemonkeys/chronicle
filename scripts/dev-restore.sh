#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup.sql>"
  exit 1
fi

FILE=$1
if [[ ! -f "$FILE" ]]; then
  echo "Backup file not found: $FILE"
  exit 1
fi

POSTGRES_CONTAINER=$(docker compose ps -q postgres)
if [[ -z "$POSTGRES_CONTAINER" ]]; then
  echo "postgres container is not running"
  exit 1
fi

cat "$FILE" | docker exec -i "$POSTGRES_CONTAINER" psql -U "${POSTGRES_USER:-chronicle}" "${POSTGRES_DB:-chronicle}"

echo "Restore complete from $FILE"
