#!/usr/bin/env bash
# db-migrate-test.sh - Migration smoke test
# Verifies: fresh DB -> apply all migrations -> verify schema -> reapply -> cleanup
#
# Usage: ./scripts/db-migrate-test.sh
# Requires: Docker services running (make up)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=scripts/lib/load-env.sh
source "$SCRIPT_DIR/lib/load-env.sh"

ENV_FILE="$(tavok_env_path)"
tavok_load_env "$ENV_FILE"
tavok_require_env "$ENV_FILE" POSTGRES_PASSWORD

DB_NAME="${POSTGRES_DB:-tavok}"
DB_USER="${POSTGRES_USER:-tavok}"
TEST_DB="tavok_migration_test"
DATABASE_URL="postgresql://$DB_USER:$POSTGRES_PASSWORD@db:5432/$TEST_DB"

CONTAINER="$(docker compose ps -q db 2>/dev/null)"
if [ -z "$CONTAINER" ]; then
  echo "ERROR: PostgreSQL container is not running. Start with: make up"
  exit 1
fi

PASS=0
FAIL=0

report() {
  local status="$1"
  local name="$2"

  if [ "$status" = "PASS" ]; then
    echo "  PASS $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name"
    FAIL=$((FAIL + 1))
  fi
}

cleanup_test_db() {
  docker compose exec -T db psql -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null 2>&1 || true
}

echo "=== Migration Smoke Test ==="
echo "Using database '$DB_NAME' with user '$DB_USER'"
echo ""

echo "Step 1: Creating test database '$TEST_DB'..."
docker compose exec -T db psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $TEST_DB;" \
  -c "CREATE DATABASE $TEST_DB OWNER $DB_USER;" \
  >/dev/null 2>&1
report "PASS" "Test database created"

echo "Step 2: Applying migrations..."
MIGRATE_OUTPUT="$(docker compose exec -T \
  -e "DATABASE_URL=$DATABASE_URL" \
  web npx prisma migrate deploy --schema=./prisma/schema.prisma 2>&1)" || {
  echo "$MIGRATE_OUTPUT"
  report "FAIL" "Migration apply"
  cleanup_test_db
  echo ""
  echo "Result: $PASS passed, $FAIL failed"
  exit 1
}
report "PASS" "All migrations applied"

echo "Step 3: Verifying schema..."
TABLE_COUNT="$(docker compose exec -T db psql -U "$DB_USER" -d "$TEST_DB" -t \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" \
  2>/dev/null | tr -d '[:space:]')"

if [ "$TABLE_COUNT" -gt 10 ]; then
  report "PASS" "Schema has $TABLE_COUNT tables"
else
  report "FAIL" "Schema has only $TABLE_COUNT tables (expected >10)"
fi

for TABLE in "User" "Server" "Channel" "Message" "Agent" "DirectMessage" "ChannelAgent"; do
  EXISTS="$(docker compose exec -T db psql -U "$DB_USER" -d "$TEST_DB" -t \
    -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$TABLE');" \
    2>/dev/null | tr -d '[:space:]')"
  if [ "$EXISTS" = "t" ]; then
    report "PASS" "Table '$TABLE' exists"
  else
    report "FAIL" "Table '$TABLE' missing"
  fi
done

for ENUM in "AuthorType" "StreamStatus" "MessageType" "SwarmMode"; do
  EXISTS="$(docker compose exec -T db psql -U "$DB_USER" -d "$TEST_DB" -t \
    -c "SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname='$ENUM');" \
    2>/dev/null | tr -d '[:space:]')"
  if [ "$EXISTS" = "t" ]; then
    report "PASS" "Enum '$ENUM' exists"
  else
    report "FAIL" "Enum '$ENUM' missing"
  fi
done

IDX_COUNT="$(docker compose exec -T db psql -U "$DB_USER" -d "$TEST_DB" -t \
  -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public';" \
  2>/dev/null | tr -d '[:space:]')"
if [ "$IDX_COUNT" -gt 5 ]; then
  report "PASS" "$IDX_COUNT indexes present"
else
  report "FAIL" "Only $IDX_COUNT indexes (expected >5)"
fi

echo "Step 4: Reapplying migrations..."
REAPPLY_OUTPUT="$(docker compose exec -T \
  -e "DATABASE_URL=$DATABASE_URL" \
  web npx prisma migrate deploy --schema=./prisma/schema.prisma 2>&1)" || {
  echo "$REAPPLY_OUTPUT"
  report "FAIL" "Migration reapply"
}

if echo "$REAPPLY_OUTPUT" | grep -q "already been applied"; then
  report "PASS" "Reapply correctly reports no-op"
elif echo "$REAPPLY_OUTPUT" | grep -q "migrations have been applied"; then
  report "PASS" "Reapply correctly reports no-op"
else
  report "PASS" "Reapply succeeded"
fi

echo ""
echo "Cleaning up test database..."
cleanup_test_db

echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
