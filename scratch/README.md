---
title: OpenClaw
emoji: 🦞
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# OpenClaw Gateway on Hugging Face Spaces

This repository runs the [OpenClaw](https://github.com/openclaw/openclaw) gateway with integrated Playwright browser support on Hugging Face Spaces using Docker.

## Configuration on Hugging Face Spaces

Go to your Space Settings -> **Variables and secrets** and configure:

1. **Secrets**:
   - `GEMINI_API_KEY`: Your Google Gemini API Key. (Direct connection bypasses proxy detection).
   - `GATEWAY_PASSWORD`: Gateway connection password for Setsuna Bot.
2. **Variables**:
   - `PORT`: `7860` (Hugging Face default app port).

Do **not** set `SETSUNA_GATEWAY_URL` in the secrets to ensure OpenClaw communicates directly with Gemini API and avoids reverse-proxy bans.
