#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_MESSAGE="${1:-Update}"

cd "$ROOT_DIR"
git add -A

if git diff --cached --quiet; then
  printf 'No changes to publish\n'
  exit 0
fi

git commit -m "$COMMIT_MESSAGE"
git push
