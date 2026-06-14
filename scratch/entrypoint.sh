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

# 1.6 Clear any stale Chromium SingletonLock files to prevent startup hangs
find "$OPENCLAW_HOME/.openclaw" -name "Singleton*" -exec rm -f {} \; 2>/dev/null

# 2. Run the config setup script to initialize openclaw.json with Google Proxy and auth
node /app/setup-hf-config.mjs

# 3. Start the OpenClaw gateway directly on the default port 18789
exec node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789
