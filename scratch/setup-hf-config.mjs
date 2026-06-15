#!/usr/bin/env node
/**
 * Setup for OpenClaw on Hugging Face Spaces (Tuned with Gemini Proxy integration).
 */
import fs from "node:fs";
import path from "node:path";

const home = process.env.OPENCLAW_HOME || process.env.HOME || "/home/user";
const stateDir = path.join(home, ".openclaw");
const configPath = path.join(stateDir, "openclaw.json");

// Token: env var, or read from file if OPENCLAW_GATEWAY_TOKEN_FILE is set
function readGatewayToken() {
  const fromEnv = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const filePath = process.env.OPENCLAW_GATEWAY_TOKEN_FILE?.trim();
  if (filePath && fs.existsSync(filePath)) {
    try {
      return fs.readFileSync(filePath, "utf-8").trim();
    } catch {
      return "";
    }
  }
  return "";
}

const gatewayToken = readGatewayToken();
const gatewayPassword = process.env.OPENCLAW_GATEWAY_PASSWORD?.trim() || process.env.GATEWAY_PASSWORD?.trim();

// Trusted proxies
const DEFAULT_HF_TRUSTED_PROXY_IPS = [
  "10.16.4.123",
  "10.16.34.155",
  "10.20.1.9",
  "10.20.1.222",
  "10.20.26.157",
  "10.20.31.87",
];
const trustedProxiesRaw = process.env.OPENCLAW_GATEWAY_TRUSTED_PROXIES?.trim();
const trustedProxies =
  trustedProxiesRaw && trustedProxiesRaw.length > 0
    ? trustedProxiesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_HF_TRUSTED_PROXY_IPS;

const allowedOriginsRaw = process.env.OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS?.trim();
const allowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    // keep config empty
  }
}

// 1. Config Gemini provider using Setsuna Gateway Proxy or directly if key is on Space
let setsunaUrl = process.env.SETSUNA_GATEWAY_URL?.trim();
if (setsunaUrl && !setsunaUrl.startsWith('http://') && !setsunaUrl.startsWith('https://')) {
  setsunaUrl = 'https://' + setsunaUrl;
}
console.log(`[setup-hf-config] Configured Setsuna Gateway URL: ${setsunaUrl || 'Not Configured'}`);

if (setsunaUrl) {
  if (!config.models) config.models = {};
  if (!config.models.providers) config.models.providers = {};
  config.models.providers["google-proxy"] = {
    baseUrl: setsunaUrl, // Redirect requests to Setsuna's proxy server on Railway
    api: "google-generative-ai",
    apiKey: gatewayPassword || "DUMMY_KEY", // Authenticate request with the gateway password
    models: [
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" }
    ]
  };

  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};
  if (!config.agents.defaults.model) config.agents.defaults.model = {};
  config.agents.defaults.model.primary = "google-proxy/gemini-3.1-flash-lite";
} else {
  // Fallback to direct google-generative-ai if Gemini keys are configured directly on the Space
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.GOOGLE_API_KEY);
  if (hasGeminiKey) {
    if (!config.models) config.models = {};
    if (!config.models.providers) config.models.providers = {};
    config.models.providers["google-generative-ai"] = {
      apiKey: process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.GOOGLE_API_KEY,
      api: "google-generative-ai"
    };
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    config.agents.defaults.model.primary = "google-generative-ai/gemini-3.1-flash-lite";
  } else {
    const defaultModel = process.env.OPENCLAW_HF_DEFAULT_MODEL?.trim() || "huggingface/deepseek-ai/DeepSeek-R1";
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    config.agents.defaults.model.primary = defaultModel;
  }
}

// 2. Auth config
const useTokenAuth = Boolean(gatewayToken);
const usePasswordAuth = Boolean(gatewayPassword) && !useTokenAuth;
if (useTokenAuth || usePasswordAuth) {
  if (!config.gateway) config.gateway = {};
  if (!config.gateway.auth) config.gateway.auth = {};
  if (useTokenAuth) {
    config.gateway.auth.mode = "token";
    config.gateway.auth.token = gatewayToken;
  } else {
    config.gateway.auth.mode = "password";
    config.gateway.auth.password = gatewayPassword;
  }
}

if (useTokenAuth || usePasswordAuth) {
  if (!config.gateway) config.gateway = {};
  if (!config.gateway.controlUi) config.gateway.controlUi = {};
  config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
}

// 2.5 Enable HTTP chatCompletions endpoint so the bot can send requests
if (!config.gateway) config.gateway = {};
if (!config.gateway.http) config.gateway.http = {};
if (!config.gateway.http.endpoints) config.gateway.http.endpoints = {};
if (!config.gateway.http.endpoints.chatCompletions) config.gateway.http.endpoints.chatCompletions = {};
config.gateway.http.endpoints.chatCompletions.enabled = true;

// 3. Trusted proxies & origins
if (!config.gateway) config.gateway = {};
config.gateway.trustedProxies = trustedProxies;

if (allowedOrigins.length > 0) {
  if (!config.gateway) config.gateway = {};
  if (!config.gateway.controlUi) config.gateway.controlUi = {};
  config.gateway.controlUi.allowedOrigins = allowedOrigins;
}

// 3.5 Disable memory search vector provider to keep memory footprint low
if (!config.agents) config.agents = {};
if (!config.agents.defaults) config.agents.defaults = {};
if (!config.agents.defaults.memorySearch) config.agents.defaults.memorySearch = {};
config.agents.defaults.memorySearch.enabled = false;

// 4. Browser config (Sandbox-free arguments to prevent container suspensions)
if (!config.browser) config.browser = {};
config.browser.noSandbox = true;
config.browser.headless = true;
config.browser.defaultProfile = "openclaw";

fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

console.log(`[setup-hf-config] Config initialized: ${configPath}`);
