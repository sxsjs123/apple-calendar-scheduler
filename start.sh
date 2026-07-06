#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  exec node server.js
fi

BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$BUNDLED_NODE" ]; then
  exec "$BUNDLED_NODE" server.js
fi

echo "Node.js is required. Install Node.js or run this inside Codex desktop." >&2
exit 1
