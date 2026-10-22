#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_REF="${IMAGE_REF:-docker.io/andpra70/kodak-k-print-web:${TAG:-latest}}"
VITE_BASE="${VITE_BASE:-/kodak2/}"

docker build \
  --platform linux/amd64 \
  --file "$ROOT_DIR/Dockerfile" \
  --build-arg "VITE_BASE=$VITE_BASE" \
  --tag "$IMAGE_REF" \
  "$ROOT_DIR"

printf 'Built %s (Vite base: %s)\n' "$IMAGE_REF" "$VITE_BASE"
