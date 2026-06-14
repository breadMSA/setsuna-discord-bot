#!/bin/sh
set -e

# 1. Persistence: use /data if writable, else $HOME
if mkdir -p /data/.openclaw 2>/dev/null; then
  export OPENCLAW_HOME=/data
else
  export OPENCLAW_HOME=${HOME:-/root}
  mkdir -p "$OPENCLAW_HOME/.openclaw"
fi

# 2. Run the config setup script to initialize openclaw.json with Google Proxy and auth
node /app/setup-hf-config.mjs

# 3. Start the OpenClaw gateway directly on the exposed port
PORT_TO_USE=${PORT:-7860}
exec node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port "$PORT_TO_USE"
