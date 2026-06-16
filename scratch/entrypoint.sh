#!/bin/sh
set -e

# 1. openclaw home is /home/node in the official openclaw image
export OPENCLAW_HOME=/home/node
mkdir -p "$OPENCLAW_HOME/.openclaw"

# 1.5 Clear stale Chromium SingletonLock files
find "$OPENCLAW_HOME/.openclaw" -name "Singleton*" -exec rm -f {} \; 2>/dev/null || true

# 2. Initialize openclaw.json with Gemini/auth/browser config
node /app/setup-hf-config.mjs

# 3. Start the OpenClaw gateway via tini (reaps zombie Chromium processes)
PORT_TO_USE=${PORT:-7860}
exec tini -- node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port "$PORT_TO_USE"
