#!/usr/bin/env bash
# dev-link.sh — rebuild playswag and install the packed tarball into a consumer
# project.  Uses `npm pack` instead of `npm link` to avoid duplicate-module
# errors (e.g. duplicate @playwright/test) that symlink-based linking causes.
#
# Usage:
#   ./dev-link.sh /path/to/consumer-project
#
# The script will:
#   1. Build playswag
#   2. Pack it into a .tgz in the playswag root
#   3. Run `npm install file:<abs-path-to-tgz>` in the consumer project
#   4. Clean up the .tgz afterwards
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONSUMER="${1:-}"

if [[ -z "$CONSUMER" ]]; then
  echo "Usage: ./dev-link.sh /path/to/consumer-project" >&2
  exit 1
fi

if [[ ! -d "$CONSUMER" ]]; then
  echo "Error: consumer directory not found: $CONSUMER" >&2
  exit 1
fi

cd "$SCRIPT_DIR"

echo "▶  Building playswag..."
npm run build

echo "▶  Packing..."
TARBALL=$(npm pack --json 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))[0].filename")
TARBALL_PATH="$SCRIPT_DIR/$TARBALL"

echo "▶  Installing into $CONSUMER ..."
npm install --prefix "$CONSUMER" "file:$TARBALL_PATH"

rm -f "$TARBALL_PATH"

VERSION=$(node -p "require('./package.json').version")
echo "✓  playswag@${VERSION} installed in $CONSUMER"
