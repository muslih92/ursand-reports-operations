#!/usr/bin/env bash
# Pull the latest code and redeploy on the VPS.
# Usage: bash deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building and restarting containers"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

echo "==> Cleaning old images"
docker image prune -f

echo "==> Done. Status:"
docker compose -f deploy/docker-compose.yml ps
