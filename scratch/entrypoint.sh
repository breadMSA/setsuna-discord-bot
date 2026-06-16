#!/bin/sh
set -e

# 1. openclaw home is /home/node in the official openclaw image
export OPENCLAW_HOME=/home/node
mkdir -p "$OPENCLAW_HOME/.openclaw"

# 1.5 Clear stale Chromium SingletonLock files
find "$OPENCLAW_HOME/.openclaw" -name "Singleton*" -exec rm -f {} \; 2>/dev/null || true

# 2. Start local Gemini key-rotation proxy in background (localhost:18789)
#    All comma-separated GEMINI_API_KEY / GEMINI_API_KEYS values are rotated here.
node /app/proxy.cjs &
PROXY_PID=$!
echo "[entrypoint] Key-rotation proxy started (PID $PROXY_PID)"
# Give the proxy a moment to bind before openclaw starts
sleep 1

# 3. Initialize openclaw.json pointing google provider to local proxy
node /app/setup-hf-config.mjs

# 4. Start the OpenClaw gateway via tini
PORT_TO_USE=${PORT:-7860}
exec tini -- node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port "$PORT_TO_USE"
