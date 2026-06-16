#!/bin/sh
set -e

# 1. openclaw home is /home/node in the official openclaw image
export OPENCLAW_HOME=/home/node
mkdir -p "$OPENCLAW_HOME/.openclaw"

# 1.5 Clear stale Chromium SingletonLock files
find "$OPENCLAW_HOME/.openclaw" -name "Singleton*" -exec rm -f {} \; 2>/dev/null || true

# 2. Strip comma-separated key lists down to the first key so openclaw's
#    auto-detection doesn't pass a multi-key string to Google's API
if [ -n "$GEMINI_API_KEY" ]; then
  GEMINI_API_KEY=$(printf '%s' "$GEMINI_API_KEY" | cut -d',' -f1 | tr -d ' ')
  export GEMINI_API_KEY
fi
if [ -n "$GEMINI_API_KEYS" ]; then
  GEMINI_API_KEYS=$(printf '%s' "$GEMINI_API_KEYS" | cut -d',' -f1 | tr -d ' ')
  export GEMINI_API_KEYS
fi
if [ -n "$GOOGLE_API_KEY" ]; then
  GOOGLE_API_KEY=$(printf '%s' "$GOOGLE_API_KEY" | cut -d',' -f1 | tr -d ' ')
  export GOOGLE_API_KEY
fi

# 3. Initialize openclaw.json with Gemini/auth/browser config
node /app/setup-hf-config.mjs

# 3. Start the OpenClaw gateway via tini (reaps zombie Chromium processes)
PORT_TO_USE=${PORT:-7860}
exec tini -- node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port "$PORT_TO_USE"
