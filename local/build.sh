#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${OUTPUT:-$ROOT_DIR/dist/k-print-linux-amd64}"

cd "$ROOT_DIR"
GOOS=linux GOARCH=amd64 go build -o "$OUTPUT" ./cmd/k-print

printf 'Built %s (linux/amd64)\n' "$OUTPUT"
