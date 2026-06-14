# OpenClaw Gateway on Railway

This service runs the [OpenClaw](https://github.com/openclaw/openclaw) gateway with integrated Playwright browser support on Railway.

## Deployment on Railway

1. **Create a new Private Repository** on GitHub (e.g., `my-openclaw`).
2. **Push the contents of this folder** into your repository:
   - `README.md`
   - `Dockerfile`
   - `setup-hf-config.mjs`
   - `entrypoint.sh`
   - `.gitattributes`
3. **Link to Railway**:
   - Go to your Railway project.
   - Click **New → GitHub Repo** and select your repository.
4. **Configure Variables** in Railway:
   - **`SETSUNA_GATEWAY_URL`** — The public URL of your Setsuna bot service on Railway (e.g., `https://setsuna-xxx.up.railway.app`). **Required.**
   - **`OPENCLAW_GATEWAY_PASSWORD`** — Gateway password to authenticate against the Setsuna proxy. **Required.**
5. **Generate Service Domain**:
   - In the OpenClaw service settings on Railway, go to **Settings → Networking → Generate Domain**.
   - Input port **`7860`** (or whatever port you prefer, standard default in Dockerfile is 7860).
   - Copy the generated domain and paste it into the **`OPENCLAW_API_URL`** variable of the Setsuna bot service on Railway.
