# OpenClaw Gateway for Railway (Tuned with Playwright Browser Support)
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Optional: point to a fork or branch
ARG OPENCLAW_REPO=https://github.com/Josephrp/openclaw.git
ARG OPENCLAW_REF=hf-spaces

# Upgrade Node.js to >=22.12.0 using NodeSource and install Bun
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl git ca-certificates unzip gnupg && \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends google-chrome-stable && \
    apt-get purge -y nodejs npm && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN npm install -g pnpm

WORKDIR /app

# Clone OpenClaw and build
RUN git clone --depth 1 --branch "${OPENCLAW_REF}" "${OPENCLAW_REPO}" . \
    && rm -f pnpm-lock.yaml \
    && pnpm install \
    && pnpm add -w -D @rolldown/binding-linux-x64-gnu@1.0.0-rc.3 \
    && pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Expose port 18789 (OpenClaw default port, Railway will bind to PORT)
EXPOSE 18789

# Copy configuration setup and entrypoint files from the repository
COPY setup-hf-config.mjs /app/setup-hf-config.mjs
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

# Token/password: set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD in secrets
ENTRYPOINT ["/app/entrypoint.sh"]
