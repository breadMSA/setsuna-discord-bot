/**
 * Local Gemini API key-rotation proxy for OpenClaw on HF Spaces.
 * Listens on localhost:18789, intercepts Google Generative AI API requests,
 * rotates through all comma-separated keys in GEMINI_API_KEY / GEMINI_API_KEYS,
 * and falls back through model list when a key hits rate limits.
 */
'use strict';
const http = require('http');
const https = require('https');
const querystring = require('querystring');

const PORT = 18789;

// Models to fall back through when a model hits rate limits.
// gemini-3.1-flash-lite is the default; others are used when it 429s.
const FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-3.1-pro',
  'gemini-2.5-pro',
  'gemini-1.5-flash'
];

let globalKeyCounter = 0;

function getApiKeys() {
  const keys = [];
  for (const envName of Object.keys(process.env)) {
    if (/^(GEMINI_API_KEY|GEMINI_API_KEYS|GOOGLE_API_KEY)/i.test(envName)) {
      const val = process.env[envName];
      if (!val) continue;
      for (const k of val.split(',')) {
        const t = k.trim();
        if (t && t !== 'DUMMY_KEY' && !keys.includes(t)) keys.push(t);
      }
    }
  }
  return keys;
}

function forwardToGoogle(path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    delete h['host'];
    delete h['content-length'];
    delete h['authorization'];
    h['content-type'] = h['content-type'] || 'application/json';

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path,
      method: method || 'POST',
      headers: h,
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = urlObj.pathname;

  // Parse model and action from path like /v1beta/models/{model}:{action}
  const modelMatch = urlPath.match(/^(?:\/v1beta|\/v1)?\/models\/([^/:]+)(:[^?]*)?/);

  let bodyChunks = [];
  req.on('data', c => bodyChunks.push(c));
  req.on('end', async () => {
    const bodyBuf = Buffer.concat(bodyChunks);
    const keys = getApiKeys();

    if (keys.length === 0) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'No Gemini API keys configured', status: 'UNAUTHENTICATED' } }));
    }

    const requestedModel = modelMatch ? modelMatch[1] : null;
    const action = modelMatch ? (modelMatch[2] || '') : '';

    // Build model rotation list: requested model first, then fallbacks
    const modelsToTry = requestedModel ? [requestedModel] : [];
    for (const m of FALLBACK_MODELS) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }

    let lastResult = null;
    let success = false;

    for (const model of modelsToTry) {
      if (success) break;
      for (let i = 0; i < keys.length && !success; i++) {
        const keyIndex = (globalKeyCounter + i) % keys.length;
        const key = keys[keyIndex];
        const masked = key.substring(0, 6) + '...' + key.slice(-4);

        // Always use /v1beta — newer models aren't on /v1
        const effectivePath = `/v1beta/models/${model}${action}?key=${encodeURIComponent(key)}`;
        console.log(`[proxy] model="${model}" key="${masked}"`);

        try {
          const result = await forwardToGoogle(effectivePath, req.method, req.headers, bodyBuf);
          lastResult = result;
          if (result.statusCode === 200) {
            globalKeyCounter = (keyIndex + 1) % keys.length;
            success = true;
            res.writeHead(200, result.headers);
            res.end(result.body);
          } else {
            let msg = '';
            try { msg = JSON.parse(result.body).error?.message || ''; } catch (_) {}
            console.warn(`[proxy] model="${model}" key="${masked}" status=${result.statusCode} ${msg.substring(0, 80)}`);
          }
        } catch (err) {
          console.error(`[proxy] network error: ${err.message}`);
          lastResult = { statusCode: 502, headers: {}, body: Buffer.from(JSON.stringify({ error: { message: err.message } })) };
        }
      }
    }

    if (!success && lastResult) {
      res.writeHead(lastResult.statusCode, lastResult.headers);
      res.end(lastResult.body);
    } else if (!success) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'All keys and models exhausted' } }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] Gemini key-rotation proxy listening on localhost:${PORT}`);
  console.log(`[proxy] Loaded ${getApiKeys().length} API key(s)`);
});
