#!/usr/bin/env bash
set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

# Track failures
FAILURES=""

# Run TypeScript type check
if command -v pnpm &> /dev/null; then
  pnpm --dir packages/web tsc --noEmit 2>&1 || FAILURES="$FAILURES\n- TypeScript type check failed"
fi

# Run web tests if they exist
if [ -f "packages/web/package.json" ]; then
  pnpm --dir packages/web test --passWithNoTests --watchAll=false 2>&1 || FAILURES="$FAILURES\n- Web tests failed"
fi

# Run gateway tests
if [ -f "gateway/mix.exs" ]; then
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
