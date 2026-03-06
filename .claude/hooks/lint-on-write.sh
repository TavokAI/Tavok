#!/usr/bin/env bash
set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Determine which service this file belongs to and lint accordingly
case "$FILE_PATH" in
  */packages/web/*|*/packages/shared/*)
    # TypeScript/JavaScript — run Prettier check and ESLint
    cd "$CLAUDE_PROJECT_DIR"
    if command -v pnpm &> /dev/null; then
      # Format the specific file
      pnpm --dir packages/web prettier --write "$FILE_PATH" 2>/dev/null || true
      # Lint the specific file (if .ts/.tsx/.js/.jsx)
      case "$FILE_PATH" in
        *.ts|*.tsx|*.js|*.jsx)
          pnpm --dir packages/web eslint "$FILE_PATH" 2>&1 || {
            echo "ESLint errors found in $FILE_PATH" >&2
            exit 2
          }
          ;;
      esac
    fi
    ;;
  */gateway/*)
    # Elixir — run mix format on the specific file
    cd "$CLAUDE_PROJECT_DIR/gateway"
    case "$FILE_PATH" in
      *.ex|*.exs)
        mix format "$FILE_PATH" 2>/dev/null || true
        ;;
    esac
    ;;
  */streaming/*)
    # Go — run gofmt on the specific file
    case "$FILE_PATH" in
      *.go)
        gofmt -w "$FILE_PATH" 2>/dev/null || true
        cd "$CLAUDE_PROJECT_DIR/streaming"
        go vet ./... 2>&1 || {
          echo "Go vet errors found" >&2
          exit 2
        }
        ;;
    esac
    ;;
esac

exit 0
