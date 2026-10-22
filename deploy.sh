#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
REGISTRY="${REGISTRY:-docker.io/andpra70}"
IMAGE_NAME="${IMAGE_NAME:-kodak-k-print-web}"
TAG="${TAG:-${1:-latest}}"
IMAGE_REF="${REGISTRY}/${IMAGE_NAME}:${TAG}"
VITE_BASE="${VITE_BASE:-/kodak2/}"

docker build --platform "${PLATFORM:-linux/amd64}" --build-arg "VITE_BASE=$VITE_BASE" --tag "$IMAGE_REF" .
docker push "$IMAGE_REF"
printf 'Image published: %s (base: %s)\n' "$IMAGE_REF" "$VITE_BASE"
