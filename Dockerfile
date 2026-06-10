FROM ghcr.io/openclaw/openclaw:latest

USER root

# Install Chromium dependencies, fonts, and tini (reaps zombie Chromium processes to prevent 503/OOM)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    libxss1 \
    tini \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV OPENCLAW_BROWSER_NO_SANDBOX=1
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV TINI_SUBREAPER=1

USER node

# Create the init script that safely writes openclaw.json using Node.js to avoid any shell escaping issues
RUN echo "const fs = require('fs'); \
const config = { \
  gateway: { \
    mode: 'local', \
    bind: 'lan', \
    auth: { \
      mode: 'token', \
      token: process.env.GATEWAY_PASSWORD \
    }, \
    http: { \
      endpoints: { \
        chatCompletions: { \
          enabled: true \
        } \
      } \
    } \
  }, \
  agents: { \
    defaults: { \
      model: { \
        primary: 'google/gemini-3.1-flash-lite' \
      } \
    } \
  }, \
  tools: { \
    web: { \
      search: { \
        provider: 'gemini' \
      } \
    } \
  }, \
  browser: { \
    noSandbox: true, \
    extraArgs: [ \
      '--disable-gpu', \
      '--disable-dev-shm-usage', \
      '--no-sandbox', \
      '--js-flags=--max-old-space-size=512' \
    ] \
  } \
}; \
fs.mkdirSync('/home/node/.openclaw', { recursive: true }); \
fs.writeFileSync('/home/node/.openclaw/openclaw.json', JSON.stringify(config, null, 2));" > /home/node/init-config.js

COPY proxy.js /home/node/proxy.js

EXPOSE 18789

# Run the node initialization script to write openclaw.json, create AGENTS.md, and start the proxy wrapper under tini
CMD sh -c 'node /home/node/init-config.js && mkdir -p /home/node/.openclaw/workspace && printf "當你使用網頁瀏覽或截圖工具產生截圖或檔案時，你必須在回覆的最後一行加上 MEDIA:<檔案絕對路徑>（例如：MEDIA:/home/node/.openclaw/media/browser/xxx.png），以便系統處理圖片。不要省略或自行修改此格式。" > /home/node/.openclaw/workspace/AGENTS.md && exec tini -- node /home/node/proxy.js'
