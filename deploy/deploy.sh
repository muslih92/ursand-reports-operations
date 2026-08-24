#!/usr/bin/env bash
# Pull the latest code and redeploy on the VPS, with automatic rollback.
#
# Usage:
#   bash deploy/deploy.sh              # security check + deploy + health check + rollback on failure
#   SKIP_SECURITY=1 bash deploy/deploy.sh
#   SKIP_ROLLBACK=1 bash deploy/deploy.sh
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
COMPOSE="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
LOG="$ROOT/deploy/deploy.log"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
fail() { log "FAILURE: $*"; }

log "=========== deploy start ==========="

PREV_COMMIT="$(git rev-parse HEAD)"
log "Current commit (rollback point): $PREV_COMMIT"

# ---------- 1) pre-deploy security check ----------
if [ "${SKIP_SECURITY:-0}" != "1" ]; then
  log "==> Running pre-deploy security check"
  if bash deploy/security-check.sh 2>&1 | tee -a "$LOG"; then
    log "Security check passed"
  else
    fail "Security check failed — deployment aborted, nothing was changed."
    exit 2
  fi
else
  log "Security check skipped (SKIP_SECURITY=1)"
fi

# ---------- 2) pull ----------
log "==> Pulling latest code"
if ! git pull --ff-only >>"$LOG" 2>&1; then
  fail "git pull failed — staying on $PREV_COMMIT"
  exit 3
fi
NEW_COMMIT="$(git rev-parse HEAD)"
log "New commit: $NEW_COMMIT"

rollback() {
  if [ "${SKIP_ROLLBACK:-0}" = "1" ]; then
    fail "Rollback disabled (SKIP_ROLLBACK=1). The site may be down."
    return
  fi
  log "==> ROLLBACK to $PREV_COMMIT"
  git reset --hard "$PREV_COMMIT" >>"$LOG" 2>&1
  if $COMPOSE up -d --build >>"$LOG" 2>&1; then
    log "Rollback rebuild finished, verifying health"
    if health_ok; then
      log "ROLLBACK OK — previous version is live again ($PREV_COMMIT)"
    else
      fail "Rollback rebuilt but health check still failing. Manual action required."
    fi
  else
    fail "Rollback build failed. Manual action required."
  fi
}

health_ok() {
  local i code
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || echo 000)"
    case "$code" in
      200|301|302|307|308) log "Health check OK (HTTP $code) after ${i}s"; return 0 ;;
    esac
    sleep 2
  done
  fail "Health check failed (last HTTP ${code:-000}) after $HEALTH_RETRIES attempts"
  $COMPOSE logs --tail 60 app >>"$LOG" 2>&1
  return 1
}

# ---------- 3) build & start ----------
log "==> Building and restarting containers"
if ! $COMPOSE up -d --build >>"$LOG" 2>&1; then
  fail "Build/start failed"
  $COMPOSE logs --tail 60 app >>"$LOG" 2>&1
  rollback
  exit 4
fi

# ---------- 4) health check ----------
log "==> Health check on $HEALTH_URL"
if ! health_ok; then
  rollback
  exit 5
fi

log "==> Cleaning old images"
docker image prune -f >>"$LOG" 2>&1

log "DEPLOY OK — live commit $NEW_COMMIT"
$COMPOSE ps | tee -a "$LOG"
log "=========== deploy end ============="
