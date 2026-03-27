#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
PASS_COUNT=0
FAIL_COUNT=0

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

pass() {
  printf '  PASS %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  printf '  FAIL %s\n' "$1"
  printf '       %s\n' "$2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

write_mock_docker() {
  local bin_dir="$1"
  cat >"$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${TAVOK_MOCK_DOCKER_LOG:?}"

if [ "${1-}" != "compose" ]; then
  echo "unexpected docker command: $*" >&2
  exit 1
fi
shift

if [ "${1-}" = "ps" ] && [ "${2-}" = "-q" ] && [ "${3-}" = "db" ]; then
  echo "mock-db-container"
  exit 0
fi

if [ "${1-}" != "exec" ]; then
  echo "unexpected docker compose command: $*" >&2
  exit 1
fi
shift

service=""
while [ $# -gt 0 ]; do
  case "$1" in
    -T)
      shift
      ;;
    -e)
      case "${2-}" in
        DATABASE_URL=*)
          printf '%s\n' "${2#DATABASE_URL=}" >>"$LOG_FILE"
          ;;
      esac
      shift 2
      ;;
    db|web)
      service="$1"
      shift
      break
      ;;
    *)
      shift
      ;;
  esac
done

case "$service" in
  web)
    echo "No pending migrations to apply."
    exit 0
    ;;
  db)
    args="$*"
    case "$args" in
      *"COUNT(*) FROM information_schema.tables"*)
        echo " 15 "
        ;;
      *"table_name='User'"*|*"table_name='Server'"*|*"table_name='Channel'"*|*"table_name='Message'"*|*"table_name='Agent'"*|*"table_name='DirectMessage'"*|*"table_name='ChannelAgent'"*)
        echo " t "
        ;;
      *"pg_type WHERE typname='AuthorType'"*|*"pg_type WHERE typname='StreamStatus'"*|*"pg_type WHERE typname='MessageType'"*|*"pg_type WHERE typname='SwarmMode'"*)
        echo " t "
        ;;
      *"COUNT(*) FROM pg_indexes"*)
        echo " 12 "
        ;;
      *)
        :
        ;;
    esac
    exit 0
    ;;
  *)
    echo "unexpected docker compose exec target: $*" >&2
    exit 1
    ;;
esac
EOF

  chmod +x "$bin_dir/docker"
}

run_db_migrate_test() {
  local env_file="$1"
  local output_file="$2"
  local docker_log="$3"
  local mock_bin="$4"

  (
    cd "$ROOT_DIR"
    export PATH="$mock_bin:$PATH"
    export TAVOK_ENV_FILE="$env_file"
    export TAVOK_MOCK_DOCKER_LOG="$docker_log"
    unset POSTGRES_PASSWORD
    bash "$ROOT_DIR/scripts/db-migrate-test.sh"
  ) >"$output_file" 2>&1
}

run_powershell_loader_check() {
  local env_file="$1"
  local output_file="$2"
  local powershell_bin
  local root_dir_ps
  local env_file_ps

  powershell_bin="$(command -v powershell.exe || command -v pwsh || command -v powershell || true)"
  if [ -z "$powershell_bin" ]; then
    printf 'PowerShell executable not found in PATH.\n' >"$output_file"
    return 1
  fi

  if command -v wslpath >/dev/null 2>&1; then
    root_dir_ps="$(wslpath -w "$ROOT_DIR")"
    env_file_ps="$(wslpath -w "$env_file")"
  else
    root_dir_ps="$ROOT_DIR"
    env_file_ps="$env_file"
  fi

  "$powershell_bin" -NoProfile -ExecutionPolicy Bypass -Command "& {
    . '$root_dir_ps\\scripts\\lib\\load-env.ps1'
    try {
      \$values = Import-TavokEnv -Path '$env_file_ps'
      Assert-TavokEnvVars -Values \$values -Required @('JWT_SECRET', 'INTERNAL_API_SECRET')
      Write-Output 'unexpected success'
      exit 0
    } catch {
      Write-Output \$_.Exception.Message
      exit 1
    }
  }" >"$output_file" 2>&1
}

test_db_migrate_auto_loads_dotenv() {
  local test_dir="$TMP_DIR/db-auto"
  local mock_bin="$test_dir/bin"
  local env_file="$test_dir/.env"
  local output_file="$test_dir/output.txt"
  local docker_log="$test_dir/docker.log"

  mkdir -p "$mock_bin"
  write_mock_docker "$mock_bin"
  : >"$docker_log"

  cat >"$env_file" <<'EOF'
POSTGRES_USER=release_user
POSTGRES_PASSWORD=release-secret
POSTGRES_DB=release_db
EOF

  if ! run_db_migrate_test "$env_file" "$output_file" "$docker_log" "$mock_bin"; then
    fail "db-migrate-test auto-loads .env" "$(cat "$output_file")"
    return
  fi

  if ! grep -Fq 'postgresql://release_user:release-secret@db:5432/tavok_migration_test' "$docker_log"; then
    fail "db-migrate-test auto-loads .env" "DATABASE_URL did not use POSTGRES_PASSWORD from .env"
    return
  fi

  pass "db-migrate-test auto-loads .env"
}

test_db_migrate_requires_postgres_password() {
  local test_dir="$TMP_DIR/db-missing"
  local mock_bin="$test_dir/bin"
  local env_file="$test_dir/.env"
  local output_file="$test_dir/output.txt"
  local docker_log="$test_dir/docker.log"

  mkdir -p "$mock_bin"
  write_mock_docker "$mock_bin"
  : >"$docker_log"

  cat >"$env_file" <<'EOF'
POSTGRES_USER=release_user
EOF

  if run_db_migrate_test "$env_file" "$output_file" "$docker_log" "$mock_bin"; then
    fail "db-migrate-test validates POSTGRES_PASSWORD" "script unexpectedly succeeded"
    return
  fi

  if ! grep -Fq 'POSTGRES_PASSWORD' "$output_file"; then
    fail "db-migrate-test validates POSTGRES_PASSWORD" "$(cat "$output_file")"
    return
  fi

  pass "db-migrate-test validates POSTGRES_PASSWORD"
}

test_powershell_loader_validates_required_vars() {
  local test_dir="$TMP_DIR/pwsh-loader"
  local env_file="$test_dir/.env"
  local output_file="$test_dir/output.txt"

  mkdir -p "$test_dir"

  cat >"$env_file" <<'EOF'
JWT_SECRET=test-jwt
EOF

  if run_powershell_loader_check "$env_file" "$output_file"; then
    fail "PowerShell loader validates required vars" "loader unexpectedly succeeded"
    return
  fi

  if ! grep -Fq 'INTERNAL_API_SECRET' "$output_file"; then
    fail "PowerShell loader validates required vars" "$(cat "$output_file")"
    return
  fi

  pass "PowerShell loader validates required vars"
}

printf '=== Release Script Smoke Tests ===\n'

test_db_migrate_auto_loads_dotenv
test_db_migrate_requires_postgres_password
test_powershell_loader_validates_required_vars

printf '\n=== Result: %d passed, %d failed ===\n' "$PASS_COUNT" "$FAIL_COUNT"

[ "$FAIL_COUNT" -eq 0 ]
