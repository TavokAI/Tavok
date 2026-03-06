#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block dangerous commands
case "$COMMAND" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf ."*)
    echo "Blocked: recursive delete on broad path" >&2
    exit 2
    ;;
  *"DROP DATABASE"*|*"drop database"*)
    echo "Blocked: database drop command" >&2
    exit 2
    ;;
  *"force push"*|*"--force"*|*"-f push"*)
    echo "Blocked: force push. Use --force-with-lease if needed." >&2
    exit 2
    ;;
  *"git reset --hard"*)
    echo "Blocked: hard reset. This destroys uncommitted work." >&2
    exit 2
    ;;
esac

exit 0
