#!/usr/bin/env sh
# Run the backend behavioural tests (no browser required).
set -e
cd "$(dirname "$0")/backend"
if [ ! -d node_modules ]; then
  npm ci
fi
node --test test/
