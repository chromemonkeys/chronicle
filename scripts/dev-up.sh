#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env ]]; then
  echo "Using .env overrides"
else
  echo "No .env found; using defaults from docker-compose.yml/.env.example"
fi

docker compose up -d --build

echo "Chronicle stack is starting. Check status with: docker compose ps"
