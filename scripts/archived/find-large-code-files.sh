#!/usr/bin/env bash

set -euo pipefail

threshold=500
include_archived=0
include_tests=0
include_generated=0
include_examples=0

usage() {
  cat <<'EOF' >&2
usage: find-large-code-files.sh [line-threshold] [--include-archived] [--include-tests] [--include-generated] [--include-examples]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --include-archived)
      include_archived=1
      ;;
    --include-tests)
      include_tests=1
      ;;
    --include-generated)
      include_generated=1
      ;;
    --include-examples)
      include_examples=1
      ;;
    -*)
      usage
      exit 1
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        threshold="$1"
      else
        usage
        exit 1
      fi
      ;;
  esac
  shift
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

should_skip() {
  local path="$1"

  if [ "$include_archived" -eq 0 ] && [[ "$path" == archived/* ]]; then
    return 0
  fi

  if [ "$include_tests" -eq 0 ]; then
    if [[ "$path" == tests/* ]] || [[ "$path" == */tests/* ]] || [[ "$path" == */__tests__/* ]]; then
      return 0
    fi

    case "$path" in
      *.test.ts|*.test.js|*.test.py|*.test.rs|*.spec.ts|*.spec.js|*.spec.py|*.spec.rs|*/tests.rs|*_tests.rs|*_test.rs)
        return 0
        ;;
    esac
  fi

  if [ "$include_generated" -eq 0 ] && [[ "$path" == */generated/* ]]; then
    return 0
  fi

  if [ "$include_generated" -eq 0 ] && [[ "$path" == */wasm-pkg/* ]]; then
    return 0
  fi

  if [ "$include_examples" -eq 0 ] && [[ "$path" == examples/* ]]; then
    return 0
  fi

  return 1
}

while IFS= read -r -d '' file; do
  relative_path="${file#"$repo_root"/}"

  if should_skip "$relative_path"; then
    continue
  fi

  line_count="$(wc -l < "$file")"
  if [ "$line_count" -gt "$threshold" ]; then
    printf '%s\t%s\n' "$line_count" "$relative_path" >> "$tmp_file"
  fi
done < <(
  cd "$repo_root"
  rg --files -0 -g '*.rs' -g '*.ts' -g '*.js' -g '*.py'
)

sort -nr "$tmp_file"
