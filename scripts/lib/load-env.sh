#!/usr/bin/env bash

tavok_repo_root() {
  local loader_dir
  loader_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$loader_dir/../.." >/dev/null 2>&1 && pwd
}

tavok_env_path() {
  if [ -n "${TAVOK_ENV_FILE:-}" ]; then
    printf '%s\n' "$TAVOK_ENV_FILE"
    return
  fi

  printf '%s/.env\n' "$(tavok_repo_root)"
}

tavok_load_env() {
  local env_path
  env_path="${1:-$(tavok_env_path)}"

  if [ ! -f "$env_path" ]; then
    printf 'ERROR: Missing .env file at %s. Run scripts/setup.sh or scripts/setup.ps1 first.\n' "$env_path" >&2
    return 1
  fi

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"

    case "$line" in
      ''|'#'*)
        continue
        ;;
      export\ *)
        line="${line#export }"
        ;;
    esac

    if [[ "$line" != *=* ]]; then
      continue
    fi

    key="${line%%=*}"
    value="${line#*=}"

    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$env_path"
}

tavok_require_env() {
  local env_path name
  local -a missing=()
  env_path="${1:-$(tavok_env_path)}"
  shift || true

  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      missing+=("$name")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    printf 'ERROR: Missing required configuration: %s. Update %s and rerun.\n' "$(IFS=', '; echo "${missing[*]}")" "$env_path" >&2
    return 1
  fi
}
