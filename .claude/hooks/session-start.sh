#!/bin/bash
# Cloud-session bootstrap: deps, vendored Obsidian CSS, and a Chromium for the rig.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# npm install (not ci) so the cached container state is reused across sessions.
npm install --no-audit --no-fund

# Vendored Obsidian CSS for the rig. Falls back to a pinned version on a 403.
if [ ! -f test-rig/vendor/obsidian-app.css ] && [ ! -f vendor/obsidian-app.css ]; then
  npm run rig:sync-css || echo "rig:sync-css failed; rig screenshots will use stubbed CSS"
fi

# Point the rig at the preinstalled Chromium.
CHROME="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$CHROME" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export CHROME_PATH=\"$CHROME\"" >> "$CLAUDE_ENV_FILE"
fi
