#!/usr/bin/env bash
# Cursor-safe stdio launcher for the Onyx player MCP.
# GUI-spawned processes often lack nvm/npm PATH; pin absolute binaries.
set -euo pipefail
export PATH="/home/sloppymo/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
cd /home/sloppymo/OnyxLabyrinth
export ONYX_URL="${ONYX_URL:-http://127.0.0.1:5173/OnyxLabyrinth/?debug=1}"
export ONYX_PLAYTEST_CHANNEL="${ONYX_PLAYTEST_CHANNEL:-chrome}"
exec /usr/bin/node /home/sloppymo/OnyxLabyrinth/node_modules/tsx/dist/cli.mjs \
  /home/sloppymo/OnyxLabyrinth/scripts/ai-player/mcp.ts
