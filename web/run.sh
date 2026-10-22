#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${IMAGE_REF:-docker.io/andpra70/kodak-k-print-web:${TAG:-latest}}"
HOST_PORT="${HOST_PORT:-6066}"
CONTAINER_NAME="${CONTAINER_NAME:-kodak-k-print-web}"

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  printf 'Container %s already exists; run ./stop.sh first\n' "$CONTAINER_NAME" >&2
  exit 1
fi

docker run --detach \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --publish "${HOST_PORT}:8080" \
  "$IMAGE_REF"

printf 'Started %s on http://localhost:%s\n' "$IMAGE_REF" "$HOST_PORT"
