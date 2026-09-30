#!/usr/bin/env bash
# Pre-deploy security + integrity check.
# Requires only git + Docker (with Compose) on the host — no Node/npm/Bun.
# Prints a short summary and exits non-zero when something must be fixed.
#
# Usage: bash deploy/security-check.sh
#   DATABASE_URL   (optional) run the in-database RLS suite public.security_test_report()
#   SKIP_BUILD=1   (optional) skip the Docker image build check
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
SUMMARY=()

ok()   { PASS=$((PASS+1)); SUMMARY+=("PASS  $1"); }
bad()  { FAIL=$((FAIL+1)); SUMMARY+=("FAIL  $1"); }
skip() {              SUMMARY+=("SKIP  $1"); }

echo "== Pre-deploy security check =="

# 1) No real private secrets in git-tracked files.
#    Matches actual key VALUES, not code that merely mentions a prefix.
#    Public frontend config (VITE_SUPABASE_URL / _PUBLISHABLE_KEY / _PROJECT_ID,
#    sb_publishable_* keys) is intentionally allowed.
SECRET_PATTERNS=(
  'sb_secret_[A-Za-z0-9_-]{16,}'                                   # Supabase secret key value
  'SERVICE_ROLE_KEY[[:space:]]*[=:][[:space:]]*["'\'']?eyJ[A-Za-z0-9_-]{10,}'  # service_role JWT
  'SUPABASE_JWT_SECRET[[:space:]]*[=:][[:space:]]*["'\'']?[A-Za-z0-9+/_-]{20,}'
  'postgres(ql)?://[^:[:space:]]+:[^@[:space:]]{6,}@'              # DB URL with password
  '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'                          # SSH/TLS private keys
  'sk_live_[A-Za-z0-9]{16,}'                                       # Stripe live secret
)
EXCLUDE_PATHS=(':!deploy/security-check.sh' ':!*.lock' ':!bun.lockb' ':!package-lock.json')

if ! command -v git >/dev/null 2>&1 || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  bad "Secret scan could not run (git repository not available)"
else
  HITS=""
  for p in "${SECRET_PATTERNS[@]}"; do
    # ignore documented placeholders such as PASSWORD / YOUR_... / xxxx
    h="$(git grep -I -n -E -e "$p" -- . "${EXCLUDE_PATHS[@]}" 2>/dev/null \
         | grep -v -E 'PASSWORD@|YOUR[_-]|<[a-z_-]+>|xxxx' | cut -d: -f1 | sort -u)"
    [ -n "$h" ] && HITS+="$h"$'\n'
  done
  if [ -n "$HITS" ]; then
    bad "Private secret values found in tracked files:"
    printf '%s' "$HITS" | sort -u | sed 's/^/        /'
  else
    ok "No private secrets committed (public VITE_* config allowed)"
  fi
fi

# 2) deploy/.env must not be tracked by git
if git ls-files --error-unmatch deploy/.env >/dev/null 2>&1; then
  bad "deploy/.env is tracked by git (must stay local)"
else
  ok "deploy/.env is not tracked by git"
fi

# 3) Production Docker image must build (build only — the live container is NOT touched)
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  skip "Docker build check (SKIP_BUILD=1)"
elif ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  bad "Docker / Docker Compose not available on host"
elif [ ! -f deploy/.env ]; then
  bad "deploy/.env missing (needed for build args)"
else
  echo "-- building production image (docker compose build app)..."
  if docker compose -f deploy/docker-compose.yml --env-file deploy/.env build app \
       >/tmp/ursand-build.log 2>&1; then
    ok "Production Docker image built successfully"
  else
    bad "Production Docker build failed (see /tmp/ursand-build.log)"
    tail -n 25 /tmp/ursand-build.log
  fi
fi

# 4) In-database RLS / access-rule suite
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  RES="$(psql "$DATABASE_URL" -Atc "select count(*) filter (where passed) || '/' || count(*) from public.security_test_report()" 2>/dev/null)"
  if [ -n "$RES" ]; then
    P="${RES%%/*}"; T="${RES##*/}"
    if [ "$P" = "$T" ]; then ok "RLS security suite $RES scenarios passed"
    else bad "RLS security suite only $RES scenarios passed"; fi
  else
    skip "RLS security suite could not run (check DATABASE_URL)"
  fi
else
  skip "RLS security suite (set DATABASE_URL and install psql to enable)"
fi

echo
echo "---------- Security summary ----------"
printf '%s\n' "${SUMMARY[@]}"
echo "--------------------------------------"
echo "Passed: $PASS   Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: BLOCKED — fix the failures above before rolling out."
  exit 1
fi
echo "RESULT: APPROVED for rollout."
exit 0
