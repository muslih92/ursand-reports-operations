#!/usr/bin/env bash
# Pre-deploy security + integrity check.
# Prints a short summary and exits non-zero when something must be fixed.
#
# Usage: bash deploy/security-check.sh
#   DATABASE_URL   (optional) run the in-database RLS suite public.security_test_report()
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
SUMMARY=()

ok()   { PASS=$((PASS+1)); SUMMARY+=("PASS  $1"); }
bad()  { FAIL=$((FAIL+1)); SUMMARY+=("FAIL  $1"); }
skip() {              SUMMARY+=("SKIP  $1"); }

echo "== Pre-deploy security check =="

# 1) No secret-looking values committed in the repo
if grep -rIl --exclude-dir=node_modules --exclude-dir=.git \
     -e 'sb_secret_' -e 'SUPABASE_SERVICE_ROLE_KEY *= *ey' . >/dev/null 2>&1; then
  bad "Secret-looking values found in the repository"
else
  ok "No service-role/secret keys committed"
fi

# 2) deploy/.env must not be tracked by git
if git ls-files --error-unmatch deploy/.env >/dev/null 2>&1; then
  bad "deploy/.env is tracked by git (must stay local)"
else
  ok "deploy/.env is not tracked by git"
fi

# 3) Production build must succeed
echo "-- building..."
if npm run build >/tmp/ursand-build.log 2>&1 || bun run build >/tmp/ursand-build.log 2>&1; then
  ok "Production build succeeded"
else
  bad "Production build failed (see /tmp/ursand-build.log)"
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
