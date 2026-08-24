#!/usr/bin/env bash
# Manual rollback to a previous commit.
# Usage:
#   bash deploy/rollback.sh            # go back one commit
#   bash deploy/rollback.sh <commit>   # go back to a specific commit
set -uo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
LOG="deploy/deploy.log"
TARGET="${1:-HEAD~1}"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

log "=== manual rollback to $TARGET (from $(git rev-parse --short HEAD)) ==="
git reset --hard "$TARGET" >>"$LOG" 2>&1 || { log "FAILURE: git reset failed"; exit 1; }
$COMPOSE up -d --build >>"$LOG" 2>&1 || { log "FAILURE: rebuild failed"; exit 2; }

for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ || echo 000)"
  case "$code" in 200|301|302|307|308) log "ROLLBACK OK (HTTP $code) — now on $(git rev-parse HEAD)"; exit 0 ;; esac
  sleep 2
done
log "FAILURE: rollback finished but health check failed"
exit 3
