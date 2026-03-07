#!/usr/bin/env bash
set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

# Track failures
FAILURES=""

# Run TypeScript type check
if command -v pnpm &> /dev/null; then
  (cd "$CLAUDE_PROJECT_DIR/packages/web" && pnpm tsc --noEmit 2>&1) || FAILURES="$FAILURES\n- TypeScript type check failed"
fi

# Run web tests if they exist
if [ -f "packages/web/package.json" ]; then
  (cd "$CLAUDE_PROJECT_DIR/packages/web" && pnpm test --passWithNoTests 2>&1) || FAILURES="$FAILURES\n- Web tests failed"
fi

# Run gateway tests (requires mix/Elixir installed locally)
if [ -f "gateway/mix.exs" ] && command -v mix &> /dev/null; then
  cd "$CLAUDE_PROJECT_DIR/gateway"
  mix test 2>&1 || FAILURES="$FAILURES\n- Gateway tests failed"
fi

# Run streaming tests
if [ -f "streaming/go.mod" ]; then
  cd "$CLAUDE_PROJECT_DIR/streaming"
  go test ./... 2>&1 || FAILURES="$FAILURES\n- Streaming tests failed"
fi

if [ -n "$FAILURES" ]; then
  echo -e "Tests are failing. Fix these before finishing:$FAILURES" >&2
  exit 2
fi

exit 0
