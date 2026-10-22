#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_REF="${IMAGE_REF:-docker.io/andpra70/kodak-k-print-web:${TAG:-latest}}"

export IMAGE_REF
"$ROOT_DIR/build.sh"
docker push "$IMAGE_REF"

printf 'Published image %s\n' "$IMAGE_REF"
