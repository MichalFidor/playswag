#!/usr/bin/env bash
# Wait until a scoped package version is readable from the npm registry (post-publish indexing lag).
set -euo pipefail

PACKAGE="${1:?package name required}"
VERSION="${2:?version required}"
MAX_ATTEMPTS="${3:-12}"
SLEEP_SECONDS="${4:-30}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if npm view "${PACKAGE}@${VERSION}" version 2>/dev/null; then
    exit 0
  fi
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "Waiting for npm registry (attempt ${attempt}/${MAX_ATTEMPTS})..."
    sleep "$SLEEP_SECONDS"
  fi
done

echo "::error::${PACKAGE}@${VERSION} not visible on npm after ${MAX_ATTEMPTS} attempts (~$((MAX_ATTEMPTS * SLEEP_SECONDS))s)."
exit 1
