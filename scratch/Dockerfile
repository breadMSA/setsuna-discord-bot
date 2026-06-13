# OpenClaw Gateway for Hugging Face Spaces (Tuned with Gemini API Proxy & Key Rotation)
FROM node:22-bookworm

# Optional: point to a fork or branch (set in Space Variables)
ARG OPENCLAW_REPO=https://github.com/Josephrp/openclaw.git
ARG OPENCLAW_REF=hf-spaces

# Install git and Bun (needed for build scripts)
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

# Clone OpenClaw and build (no COPY from host; Space repo only has this Dockerfile)
RUN git clone --depth 1 --branch "${OPENCLAW_REF}" "${OPENCLAW_REPO}" . \
    && pnpm install --frozen-lockfile \
    && pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Expose port 7860 (Hugging Face Spaces default port)
EXPOSE 7860

# Copy configuration setup and entrypoint files from the repository
COPY setup-hf-config.mjs /app/setup-hf-config.mjs
COPY entrypoint.sh /app/entrypoint.sh

# HF Spaces Dev Mode injects steps that expect /home/user; create it so they don't fail with "Permission denied"
RUN chown -R node:node /app \
    && mkdir -p /home/user \
    && chown -R node:node /home/user \
    && chmod +x /app/entrypoint.sh

USER node

# Token/password: set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD in Space Secrets
ENTRYPOINT ["/app/entrypoint.sh"]
