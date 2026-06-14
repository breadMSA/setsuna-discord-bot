# OpenClaw Gateway for Railway (Tuned with Playwright Browser Support)
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Optional: point to a fork or branch
ARG OPENCLAW_REPO=https://github.com/Josephrp/openclaw.git
ARG OPENCLAW_REF=hf-spaces

# Install Bun (needed for some build scripts)
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

# Clone OpenClaw and build
RUN git clone --depth 1 --branch "${OPENCLAW_REF}" "${OPENCLAW_REPO}" . \
    && pnpm install --frozen-lockfile \
    && pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Expose port 7860 (Hugging Face Spaces default port, Railway will bind to PORT)
EXPOSE 7860

# Copy configuration setup and entrypoint files from the repository
COPY setup-hf-config.mjs /app/setup-hf-config.mjs
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

# Token/password: set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD in secrets
ENTRYPOINT ["/app/entrypoint.sh"]
