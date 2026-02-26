#!/usr/bin/env bash
set -euo pipefail

docker compose down -v --remove-orphans

echo "Removed containers and named volumes."
