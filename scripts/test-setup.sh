#!/usr/bin/env bash
# Smoke tests for scripts/setup.sh
# Validates non-interactive mode, --domain flag, REDIS_PASSWORD generation,
# and .env output structure.
# Usage: bash scripts/test-setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETUP_SCRIPT="$PROJECT_DIR/scripts/setup.sh"

PASS=0
FAIL=0
TOTAL=0

# ── helpers ──────────────────────────────────────────────────

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  PASS  $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL  $1"
  if [ -n "${2:-}" ]; then
    echo "        $2"
  fi
}

# Run setup.sh in a temp directory, return the generated .env content
# Args: additional flags to pass to setup.sh
run_setup() {
  local tmpdir
  tmpdir=$(mktemp -d)
  # Copy docker-compose.yml so the checkout detection (if any) passes
  touch "$tmpdir/docker-compose.yml"

  (cd "$tmpdir" && bash "$SETUP_SCRIPT" "$@") >/dev/null 2>&1 || true

  if [ -f "$tmpdir/.env" ]; then
    cat "$tmpdir/.env"
  fi

  rm -rf "$tmpdir"
}

echo ""
echo "======================================="
echo "     Setup Script Smoke Tests"
echo "======================================="

# ── --domain flag ────────────────────────────────────────────

echo ""
echo "=== --domain flag ==="

ENV_OUT=$(run_setup --domain localhost)

LABEL="--domain localhost sets DOMAIN=localhost"
if echo "$ENV_OUT" | grep -q "^DOMAIN=localhost$"; then
  pass "$LABEL"
else
  fail "$LABEL" "DOMAIN line not found"
fi

LABEL="--domain localhost uses http:// URL"
if echo "$ENV_OUT" | grep -q "^NEXTAUTH_URL=http://localhost:5555$"; then
  pass "$LABEL"
else
  fail "$LABEL" "expected http://localhost:5555"
fi

LABEL="--domain localhost uses ws:// gateway"
if echo "$ENV_OUT" | grep -q "^NEXT_PUBLIC_GATEWAY_URL=ws://localhost:4001/socket$"; then
  pass "$LABEL"
else
  fail "$LABEL" "expected ws://localhost:4001/socket"
fi

ENV_OUT=$(run_setup --domain chat.example.com)

LABEL="--domain chat.example.com sets DOMAIN correctly"
if echo "$ENV_OUT" | grep -q "^DOMAIN=chat.example.com$"; then
  pass "$LABEL"
else
  fail "$LABEL" "DOMAIN line not found"
fi

LABEL="--domain chat.example.com uses https:// URL"
if echo "$ENV_OUT" | grep -q "^NEXTAUTH_URL=https://chat.example.com$"; then
  pass "$LABEL"
else
  fail "$LABEL" "expected https://chat.example.com"
fi

LABEL="--domain chat.example.com uses wss:// gateway"
if echo "$ENV_OUT" | grep -q "^NEXT_PUBLIC_GATEWAY_URL=wss://chat.example.com/socket$"; then
  pass "$LABEL"
else
  fail "$LABEL" "expected wss://chat.example.com/socket"
fi

# ── non-interactive mode (piped stdin) ───────────────────────

echo ""
echo "=== non-interactive mode ==="

# Run without --domain in a non-interactive context (piped)
tmpdir=$(mktemp -d)
touch "$tmpdir/docker-compose.yml"
(cd "$tmpdir" && echo "" | bash "$SETUP_SCRIPT") >/dev/null 2>&1 || true

LABEL="non-interactive defaults to DOMAIN=localhost"
if [ -f "$tmpdir/.env" ] && grep -q "^DOMAIN=localhost$" "$tmpdir/.env"; then
  pass "$LABEL"
else
  fail "$LABEL" ".env missing or wrong domain"
fi
rm -rf "$tmpdir"

# ── REDIS_PASSWORD generation ────────────────────────────────

echo ""
echo "=== REDIS_PASSWORD generation ==="

ENV_OUT=$(run_setup --domain localhost)

LABEL="REDIS_PASSWORD is present in .env"
if echo "$ENV_OUT" | grep -q "^REDIS_PASSWORD="; then
  pass "$LABEL"
else
  fail "$LABEL" "REDIS_PASSWORD line not found"
fi

LABEL="REDIS_PASSWORD is non-empty"
REDIS_PW=$(echo "$ENV_OUT" | grep "^REDIS_PASSWORD=" | cut -d= -f2-)
if [ -n "$REDIS_PW" ]; then
  pass "$LABEL"
else
  fail "$LABEL" "value is empty"
fi

LABEL="REDIS_PASSWORD has reasonable length (>10 chars)"
if [ "${#REDIS_PW}" -gt 10 ]; then
  pass "$LABEL"
else
  fail "$LABEL" "length is ${#REDIS_PW}"
fi

# ── all expected secrets present ─────────────────────────────

echo ""
echo "=== all secrets present ==="

ENV_OUT=$(run_setup --domain localhost)

for VAR in NEXTAUTH_SECRET JWT_SECRET INTERNAL_API_SECRET SECRET_KEY_BASE ENCRYPTION_KEY POSTGRES_PASSWORD REDIS_PASSWORD; do
  LABEL="$VAR is present and non-empty"
  VALUE=$(echo "$ENV_OUT" | grep "^${VAR}=" | cut -d= -f2-)
  if [ -n "$VALUE" ]; then
    pass "$LABEL"
  else
    fail "$LABEL" "missing or empty"
  fi
done

# ── secrets are unique across runs ───────────────────────────

echo ""
echo "=== uniqueness ==="

ENV_OUT_1=$(run_setup --domain localhost)
ENV_OUT_2=$(run_setup --domain localhost)

PW1=$(echo "$ENV_OUT_1" | grep "^REDIS_PASSWORD=" | cut -d= -f2-)
PW2=$(echo "$ENV_OUT_2" | grep "^REDIS_PASSWORD=" | cut -d= -f2-)

LABEL="REDIS_PASSWORD differs between runs"
if [ "$PW1" != "$PW2" ]; then
  pass "$LABEL"
else
  fail "$LABEL" "both runs produced: $PW1"
fi

NA1=$(echo "$ENV_OUT_1" | grep "^NEXTAUTH_SECRET=" | cut -d= -f2-)
NA2=$(echo "$ENV_OUT_2" | grep "^NEXTAUTH_SECRET=" | cut -d= -f2-)

LABEL="NEXTAUTH_SECRET differs between runs"
if [ "$NA1" != "$NA2" ]; then
  pass "$LABEL"
else
  fail "$LABEL" "both runs produced: $NA1"
fi

# ── --help flag ──────────────────────────────────────────────

echo ""
echo "=== --help flag ==="

LABEL="--help exits 0"
if bash "$SETUP_SCRIPT" --help >/dev/null 2>&1; then
  pass "$LABEL"
else
  fail "$LABEL" "non-zero exit"
fi

LABEL="--help mentions --domain"
HELP_OUT=$(bash "$SETUP_SCRIPT" --help 2>&1)
if echo "$HELP_OUT" | grep -q "\-\-domain"; then
  pass "$LABEL"
else
  fail "$LABEL" "no --domain in help text"
fi

# ── summary ──────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  Setup smoke tests: $PASS passed, $FAIL failed ($TOTAL total)"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
