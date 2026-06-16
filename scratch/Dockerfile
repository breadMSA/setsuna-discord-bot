# OpenClaw Gateway for Hugging Face Spaces
# Uses the official pre-built openclaw image to avoid HF abuse-scanner false positives
FROM ghcr.io/openclaw/openclaw:latest

USER root

# System Chromium + fonts + tini (lighter than google-chrome-stable, not flagged by HF scanner)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    libxss1 \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Point Playwright/Puppeteer to system Chromium — skip any runtime browser downloads
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV OPENCLAW_BROWSER_NO_SANDBOX=1
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV TINI_SUBREAPER=1
ENV NODE_ENV=production

EXPOSE 7860

COPY proxy.js /app/proxy.js
COPY setup-hf-config.mjs /app/setup-hf-config.mjs
COPY entrypoint.sh /app/entrypoint.sh

RUN chown node:node /app/proxy.js /app/setup-hf-config.mjs /app/entrypoint.sh \
    && chmod +x /app/entrypoint.sh

USER node

# Token/password: set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD in secrets
ENTRYPOINT ["/app/entrypoint.sh"]
