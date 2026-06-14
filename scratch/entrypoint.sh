#!/bin/sh
set -e

# 1. Persistence: use /data if writable, else $HOME
if mkdir -p /data/.openclaw 2>/dev/null; then
  export OPENCLAW_HOME=/data
else
  export OPENCLAW_HOME=${HOME:-/root}
  mkdir -p "$OPENCLAW_HOME/.openclaw"
fi

# 1.5 Optimize Node.js memory footprint for low-RAM containers
export NODE_OPTIONS="--max-old-space-size=800"

# 2. Run the config setup script to initialize openclaw.json with Google Proxy and auth
node /app/setup-hf-config.mjs

# 3. Start the OpenClaw gateway directly on port 7860 (exposed in Dockerfile)
exec node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port 7860
