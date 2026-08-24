#!/usr/bin/env bash
# Post-rollout monitoring: checks the site + key routes, logs every event,
# and alerts (webhook / email) when something fails.
#
# Cron (every 5 minutes):
#   */5 * * * * /bin/bash /opt/ursand/deploy/monitor.sh >> /var/log/ursand-monitor.log 2>&1
#
# Optional env (put them in deploy/.env):
#   ALERT_WEBHOOK_URL=https://...      # Slack/Teams/Discord style JSON webhook
#   ALERT_EMAIL=ops@example.com        # requires `mail` on the host
#   BASE_URL=https://jrwts-urs-operation.com
set -uo pipefail
cd "$(dirname "$0")/.."

[ -f deploy/.env ] && set -a && . deploy/.env && set +a

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
EVENTS="${EVENTS_LOG:-deploy/events.log}"
STATE="deploy/.monitor-state"
ROUTES=("/" "/auth" "/dashboard" "/readings" "/reports" "/availability")

event() { echo "[$(date '+%F %T')] $*" | tee -a "$EVENTS"; }

alert() {
  local msg="$1"
  event "ALERT: $msg"
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -s -m 10 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":$(printf '%s' "URSAND monitor: $msg" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || event "WARN: webhook delivery failed"
  fi
  if [ -n "${ALERT_EMAIL:-}" ] && command -v mail >/dev/null 2>&1; then
    printf '%s\n' "$msg" | mail -s "URSAND monitor alert" "$ALERT_EMAIL" || event "WARN: email delivery failed"
  fi
}

FAILURES=()

# 1) containers
for c in $(docker compose -f deploy/docker-compose.yml ps --services 2>/dev/null); do
  status="$(docker compose -f deploy/docker-compose.yml ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$c" '$1==s{print $2}')"
  [ "$status" = "running" ] || FAILURES+=("container '$c' state=${status:-missing}")
done

# 2) routes
for r in "${ROUTES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL$r" || echo 000)"
  case "$code" in
    200|301|302|307|308) ;;
    *) FAILURES+=("route $r returned HTTP $code") ;;
  esac
done

# 3) recent app errors
ERRS="$(docker compose -f deploy/docker-compose.yml logs --since 5m app 2>/dev/null | grep -icE 'error|unhandled|ECONNREFUSED' || true)"
[ "${ERRS:-0}" -gt 20 ] && FAILURES+=("$ERRS error lines in app logs during the last 5 minutes")

if [ "${#FAILURES[@]}" -eq 0 ]; then
  event "OK  all containers running, all routes healthy, app errors=${ERRS:-0}"
  if [ -f "$STATE" ] && [ "$(cat "$STATE")" = "down" ]; then
    alert "RECOVERED — the site is healthy again."
  fi
  echo "healthy" > "$STATE"
  exit 0
fi

REASON="$(printf '%s; ' "${FAILURES[@]}")"
event "FAILURE reasons: $REASON"
docker compose -f deploy/docker-compose.yml logs --tail 40 app >> "$EVENTS" 2>&1
if [ ! -f "$STATE" ] || [ "$(cat "$STATE")" != "down" ]; then
  alert "Health check failed — $REASON (details in deploy/events.log)"
fi
echo "down" > "$STATE"
exit 1
