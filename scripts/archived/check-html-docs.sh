#!/usr/bin/env bash
set -euo pipefail
# Regenerate spec artifacts (BLUF injection, schema refs) without filemap
node scripts/generate-spec-artifacts.mjs
# Rebuild pandoc HTML docs
make -s html-docs
if ! git diff --quiet -- 'docs/*.html'; then
  echo "HTML docs are stale. Run: make docs"
  exit 1
fi
