---
title: OpenClaw Gateway
emoji: 🦞
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# OpenClaw Gateway on Hugging Face Spaces

This Space runs the [OpenClaw](https://github.com/openclaw/openclaw) gateway with integrated cloud browser support.

## Quick start

1. **Create a new Space** at [huggingface.co/new-space](https://huggingface.co/new-space). Choose **Docker** as the SDK.
2. **Copy the contents of this folder** into your Space repo:
   - `README.md`
   - `Dockerfile`
   - `setup-hf-config.mjs`
   - `entrypoint.sh`
3. **Add Secrets** in your Space **Settings → Secrets**:
   - **`SETSUNA_GATEWAY_URL`** — The public URL of your Setsuna bot on Railway. **Required.**
   - **`OPENCLAW_GATEWAY_PASSWORD`** — Gateway password to authenticate against the Setsuna proxy. **Required.**
   - **`HF_TOKEN`** — Hugging Face Token (if you want to auto-wake status check / manage state).
   - **`OPENCLAW_GATEWAY_TRUSTED_PROXIES`** — Comma-separated proxy IPs if needed to trust HF reverse proxies.
