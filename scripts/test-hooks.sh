#!/usr/bin/env bash
# Smoke tests for Claude Code hook scripts.
# Runs without Docker — validates hook logic in isolation.
# Usage: bash scripts/test-hooks.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_DIR/.claude/hooks"

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

# Run a hook script with JSON on stdin.
# Returns exit code; captures stdout+stderr in $HOOK_OUT.
run_hook() {
  local script="$1"
  local json="$2"
  HOOK_OUT=$(echo "$json" | CLAUDE_PROJECT_DIR="$PROJECT_DIR" bash "$script" 2>&1) || return $?
  return 0
}

# ── block-dangerous-commands.sh ──────────────────────────────

echo ""
echo "=== block-dangerous-commands.sh ==="

# Blocked commands
for pair in \
  'rm -rf .:Blocked: recursive delete on broad path' \
  'rm -rf /:Blocked: recursive delete on broad path' \
  'rm -rf ~:Blocked: recursive delete on broad path' \
  'git reset --hard HEAD~1:Blocked: hard reset' \
  'git push --force origin main:Blocked: force push' \
  'psql -c "DROP DATABASE mydb":Blocked: database drop command' \
  'psql -c "drop database mydb":Blocked: database drop command'
do
  CMD="${pair%%:*}"
  EXPECTED_MSG="${pair#*:}"
  LABEL="blocks: $CMD"

  # Build JSON — escape inner quotes for the command
  JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'command':$(python3 -c "import json; print(json.dumps('$CMD'))")}}))")

  if run_hook "$HOOKS_DIR/block-dangerous-commands.sh" "$JSON"; then
    fail "$LABEL" "expected exit 2, got 0"
  else
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 2 ]; then
      if echo "$HOOK_OUT" | grep -qi "$(echo "$EXPECTED_MSG" | head -c 20)"; then
        pass "$LABEL"
      else
        fail "$LABEL" "exit 2 but wrong message: $HOOK_OUT"
      fi
    else
      fail "$LABEL" "expected exit 2, got $EXIT_CODE"
    fi
  fi
done

# Allowed commands
for CMD in \
  "npm test" \
  "go build ./..." \
  "mix test" \
  "git push origin main" \
  "git add -A" \
  "ls -la" \
  "docker-compose up"
do
  LABEL="allows: $CMD"
  JSON="{\"tool_input\":{\"command\":\"$CMD\"}}"

  if run_hook "$HOOKS_DIR/block-dangerous-commands.sh" "$JSON"; then
    pass "$LABEL"
  else
    fail "$LABEL" "expected exit 0, got $?"
  fi
done

# Edge cases
LABEL="allows: empty command"
if run_hook "$HOOKS_DIR/block-dangerous-commands.sh" '{"tool_input":{"command":""}}'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="allows: empty input"
if run_hook "$HOOKS_DIR/block-dangerous-commands.sh" '{}'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="allows: malformed JSON"
if run_hook "$HOOKS_DIR/block-dangerous-commands.sh" 'not-json'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

# ── lint-on-write.sh ─────────────────────────────────────────

echo ""
echo "=== lint-on-write.sh ==="

LABEL="exits 0 on empty file_path"
if run_hook "$HOOKS_DIR/lint-on-write.sh" '{"tool_input":{"file_path":""}}'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="exits 0 on missing file_path"
if run_hook "$HOOKS_DIR/lint-on-write.sh" '{"tool_input":{}}'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="exits 0 on empty input"
if run_hook "$HOOKS_DIR/lint-on-write.sh" '{}'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="exits 0 on malformed JSON"
if run_hook "$HOOKS_DIR/lint-on-write.sh" 'not-json'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="exits 0 for unrecognized path (no service match)"
if run_hook "$HOOKS_DIR/lint-on-write.sh" '{"tool_input":{"file_path":"/tmp/random/file.txt"}}'; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

# Test that known paths are recognized (won't actually lint since files don't exist,
# but the script should exit 0 because pnpm/mix/gofmt commands fail gracefully with || true)
LABEL="handles web .ts path gracefully"
if run_hook "$HOOKS_DIR/lint-on-write.sh" "{\"tool_input\":{\"file_path\":\"$PROJECT_DIR/packages/web/lib/test-dummy.ts\"}}"; then
  pass "$LABEL"
else
  # Acceptable: lint tools may not be installed locally
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 2 ]; then
    pass "$LABEL (lint error — tools present and file not found, expected)"
  else
    fail "$LABEL" "unexpected exit code: $EXIT_CODE"
  fi
fi

LABEL="handles gateway .ex path gracefully"
if run_hook "$HOOKS_DIR/lint-on-write.sh" "{\"tool_input\":{\"file_path\":\"$PROJECT_DIR/gateway/lib/test_dummy.ex\"}}"; then
  pass "$LABEL"
else
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 2 ]; then
    pass "$LABEL (lint error — tools present and file not found, expected)"
  else
    fail "$LABEL" "unexpected exit code: $EXIT_CODE"
  fi
fi

LABEL="handles streaming .go path gracefully"
if run_hook "$HOOKS_DIR/lint-on-write.sh" "{\"tool_input\":{\"file_path\":\"$PROJECT_DIR/streaming/internal/test_dummy.go\"}}"; then
  pass "$LABEL"
else
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 2 ]; then
    pass "$LABEL (lint error — tools present, expected)"
  else
    fail "$LABEL" "unexpected exit code: $EXIT_CODE"
  fi
fi

LABEL="ignores non-code files in web (e.g. .json)"
if run_hook "$HOOKS_DIR/lint-on-write.sh" "{\"tool_input\":{\"file_path\":\"$PROJECT_DIR/packages/web/package.json\"}}"; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="ignores non-code files in gateway (e.g. .md)"
if run_hook "$HOOKS_DIR/lint-on-write.sh" "{\"tool_input\":{\"file_path\":\"$PROJECT_DIR/gateway/README.md\"}}"; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

LABEL="ignores non-code files in streaming (e.g. .mod)"
if run_hook "$HOOKS_DIR/lint-on-write.sh" "{\"tool_input\":{\"file_path\":\"$PROJECT_DIR/streaming/go.mod\"}}"; then
  pass "$LABEL"
else
  fail "$LABEL" "expected exit 0, got $?"
fi

# ── verify-tests.sh (structure only) ─────────────────────────

echo ""
echo "=== verify-tests.sh ==="

LABEL="script exists and is executable"
if [ -x "$HOOKS_DIR/verify-tests.sh" ]; then
  pass "$LABEL"
else
  fail "$LABEL" "missing or not executable"
fi

LABEL="script references CLAUDE_PROJECT_DIR"
if grep -q 'CLAUDE_PROJECT_DIR' "$HOOKS_DIR/verify-tests.sh"; then
  pass "$LABEL"
else
  fail "$LABEL" "missing CLAUDE_PROJECT_DIR reference"
fi

LABEL="script checks packages/web/package.json"
if grep -q 'packages/web/package.json' "$HOOKS_DIR/verify-tests.sh"; then
  pass "$LABEL"
else
  fail "$LABEL" "missing packages/web/package.json check"
fi

LABEL="script checks gateway/mix.exs"
if grep -q 'gateway/mix.exs' "$HOOKS_DIR/verify-tests.sh"; then
  pass "$LABEL"
else
  fail "$LABEL" "missing gateway/mix.exs check"
fi

LABEL="script checks streaming/go.mod"
if grep -q 'streaming/go.mod' "$HOOKS_DIR/verify-tests.sh"; then
  pass "$LABEL"
else
  fail "$LABEL" "missing streaming/go.mod check"
fi

LABEL="script uses exit 2 on failure"
if grep -q 'exit 2' "$HOOKS_DIR/verify-tests.sh"; then
  pass "$LABEL"
else
  fail "$LABEL" "missing exit 2"
fi

# ── settings.json validation ─────────────────────────────────

echo ""
echo "=== settings.json ==="

SETTINGS="$PROJECT_DIR/.claude/settings.json"

LABEL="settings.json exists"
if [ -f "$SETTINGS" ]; then
  pass "$LABEL"
else
  fail "$LABEL" "file not found"
fi

# Parse settings once — pipe via stdin to avoid Git Bash /c/ path issues with Python
SETTINGS_JSON=$(cat "$SETTINGS")

LABEL="settings.json is valid JSON"
if echo "$SETTINGS_JSON" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  pass "$LABEL"
else
  fail "$LABEL" "invalid JSON"
fi

LABEL="settings.json has PostToolUse hook"
if echo "$SETTINGS_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'PostToolUse' in d['hooks']" 2>/dev/null; then
  pass "$LABEL"
else
  fail "$LABEL" "missing PostToolUse"
fi

LABEL="settings.json has PreToolUse hook"
if echo "$SETTINGS_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'PreToolUse' in d['hooks']" 2>/dev/null; then
  pass "$LABEL"
else
  fail "$LABEL" "missing PreToolUse"
fi

LABEL="settings.json has Stop hook"
if echo "$SETTINGS_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'Stop' in d['hooks']" 2>/dev/null; then
  pass "$LABEL"
else
  fail "$LABEL" "missing Stop"
fi

LABEL="PostToolUse matcher targets Write|Edit"
if echo "$SETTINGS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=d['hooks']['PostToolUse'][0]['matcher']
assert 'Write' in m and 'Edit' in m
" 2>/dev/null; then
  pass "$LABEL"
else
  fail "$LABEL" "wrong matcher"
fi

LABEL="PreToolUse matcher targets Bash"
if echo "$SETTINGS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=d['hooks']['PreToolUse'][0]['matcher']
assert m == 'Bash'
" 2>/dev/null; then
  pass "$LABEL"
else
  fail "$LABEL" "wrong matcher"
fi

LABEL="Stop hook timeout is 120s"
if echo "$SETTINGS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=d['hooks']['Stop'][0]['hooks'][0]['timeout']
assert t == 120
" 2>/dev/null; then
  pass "$LABEL"
else
  fail "$LABEL" "wrong timeout"
fi

# ── summary ──────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  Hook smoke tests: $PASS passed, $FAIL failed ($TOTAL total)"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
