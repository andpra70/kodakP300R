#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-kodak-k-print-web}"

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  if [ "$(docker container inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" = "true" ]; then
    docker stop "$CONTAINER_NAME" >/dev/null
  fi
  docker rm "$CONTAINER_NAME" >/dev/null
  printf 'Stopped and removed %s\n' "$CONTAINER_NAME"
else
  printf 'Container %s does not exist\n' "$CONTAINER_NAME"
fi
