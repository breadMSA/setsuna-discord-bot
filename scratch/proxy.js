const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const querystring = require('querystring');

const PORT = 18789;
const TARGET_PORT = 18790;
const DIRS_TO_CHECK = [
  '/home/node/.openclaw/media/browser',
  '/home/node/.openclaw/workspace/media',
  '/home/node/.openclaw/media'
];

let globalKeyCounter = 0;

const ALL_SEARCH_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-2.5-pro',
  'gemini-3.1-pro'
];

console.log('Starting OpenClaw gateway wrapper on port:', PORT);

// Start OpenClaw gateway on TARGET_PORT
const openclaw = spawn('node', ['openclaw.mjs', 'gateway', '--allow-unconfigured', '--port', String(TARGET_PORT)], {
  stdio: 'inherit'
});

openclaw.on('exit', (code) => {
  console.log(`OpenClaw gateway process exited with code ${code}`);
  process.exit(code || 0);
});

// A simple function to serve the latest screenshot found in any media directory
function serveLatestScreenshot(res) {
  try {
    let latestFile = null;
    let latestTime = 0;

    for (const dir of DIRS_TO_CHECK) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')) {
          const fp = path.join(dir, f);
          try {
            const stat = fs.statSync(fp);
            if (stat.isFile() && stat.mtimeMs > latestTime) {
              latestTime = stat.mtimeMs;
              latestFile = fp;
            }
          } catch (e) {
            // Ignore stat error for individual file
          }
        }
      }
    }

    if (!latestFile) {
      console.log('[Proxy] No screenshots or images found in any of the media directories');
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No screenshots found in media directories.');
    }

    console.log(`[Proxy] Serving latest screenshot from path: ${latestFile}`);
    const stat = fs.statSync(latestFile);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': stat.size
    });
    fs.createReadStream(latestFile).pipe(res);
  } catch (err) {
    console.error('[Proxy] Error finding/serving latest screenshot:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Internal proxy error: ${err.message}`);
  }
}

function getApiKeys() {
  const keys = [];
  
  if (process.env.GEMINI_API_KEYS) {
    const split = process.env.GEMINI_API_KEYS.split(',');
    for (const k of split) {
      const trimmed = k.trim();
      if (trimmed && trimmed !== 'DUMMY_KEY' && !keys.includes(trimmed)) {
        keys.push(trimmed);
      }
    }
  }

  for (const envName of Object.keys(process.env)) {
    if (/^(GEMINI_API_KEY|GOOGLE_API_KEY)/i.test(envName)) {
      const val = process.env[envName];
      if (val) {
        const split = val.split(',');
        for (const k of split) {
          const trimmed = k.trim();
          if (trimmed && trimmed !== 'DUMMY_KEY' && !keys.includes(trimmed)) {
            keys.push(trimmed);
          }
        }
      }
    }
  }

  return keys;
}

function makeGoogleRequest(apiVersion, model, action, queryParams, bodyBuffer, originalHeaders, method) {
  return new Promise((resolve, reject) => {
    const headers = { ...originalHeaders };
    delete headers['host'];
    delete headers['content-length'];
    headers['content-type'] = headers['content-type'] || 'application/json';
    headers['accept'] = 'application/json';

    const path = `${apiVersion}/models/${model}${action}?${querystring.stringify(queryParams)}`;

    const reqOpts = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: path,
      method: method || 'POST',
      headers: headers,
      timeout: 15000
    };

    const apiReq = https.request(reqOpts, (apiRes) => {
      let resChunks = [];
      apiRes.on('data', chunk => resChunks.push(chunk));
      apiRes.on('end', () => {
        resolve({
          statusCode: apiRes.statusCode,
          headers: apiRes.headers,
          body: Buffer.concat(resChunks)
        });
      });
    });

    apiReq.on('error', (err) => {
      reject(err);
    });

    apiReq.on('timeout', () => {
      apiReq.destroy(new Error('Gateway Timeout to Google API'));
    });

    if (reqOpts.method !== 'GET' && reqOpts.method !== 'HEAD' && bodyBuffer && bodyBuffer.length > 0) {
      apiReq.write(bodyBuffer);
    }
    apiReq.end();
  });
}

function handleDirectGoogleProxy(req, res) {
  const urlMatch = req.url.match(/^(\/(?:v1beta|v1)\/[^?]+)(?:\?(.*))?$/);
  const pathPart = urlMatch ? urlMatch[1] : req.url.split('?')[0];
  const queryString = urlMatch ? (urlMatch[2] || '') : (req.url.split('?')[1] || '');
  const queryParams = querystring.parse(queryString);

  let bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', async () => {
    const bodyBuffer = Buffer.concat(bodyChunks);

    const keys = getApiKeys();
    const requestKey = queryParams.key;
    if (requestKey && requestKey !== 'DUMMY_KEY' && !keys.includes(requestKey)) {
      keys.unshift(requestKey);
    }

    if (keys.length === 0) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'No API keys configured' } }));
    }

    let lastResult = null;
    let success = false;

    for (let i = 0; i < keys.length; i++) {
      const keyIndex = (globalKeyCounter + i) % keys.length;
      const key = keys[keyIndex];
      const params = { ...queryParams, key: key };
      const pathWithKey = `${pathPart}?${querystring.stringify(params)}`;

      const headers = { ...req.headers };
      delete headers['host'];
      delete headers['content-length'];

      const reqOpts = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: pathWithKey,
        method: req.method || 'POST',
        headers: headers,
        timeout: 15000
      };

      try {
        const result = await new Promise((resolve, reject) => {
          const apiReq = https.request(reqOpts, (apiRes) => {
            let chunks = [];
            apiRes.on('data', c => chunks.push(c));
            apiRes.on('end', () => resolve({
              statusCode: apiRes.statusCode,
              headers: apiRes.headers,
              body: Buffer.concat(chunks)
            }));
          });
          apiReq.on('error', reject);
          if (reqOpts.method !== 'GET' && reqOpts.method !== 'HEAD' && bodyBuffer.length > 0) {
            apiReq.write(bodyBuffer);
          }
          apiReq.end();
        });

        lastResult = result;
        if (result.statusCode === 200) {
          globalKeyCounter = (keyIndex + 1) % keys.length;
          success = true;
          res.writeHead(result.statusCode, result.headers);
          res.end(result.body);
          break;
        }
      } catch (e) {
        lastResult = { statusCode: 502, headers: {}, body: Buffer.from(e.message) };
      }
    }

    if (!success && lastResult) {
      res.writeHead(lastResult.statusCode, lastResult.headers);
      res.end(lastResult.body);
    }
  });
}

async function handleGeminiRequest(req, res) {
  const urlMatch = req.url.match(/^(\/v1beta|\/v1)\/models\/(.+?)(:[^?]+)?(?:\?(.*))?$/);
  if (!urlMatch) {
    handleDirectGoogleProxy(req, res);
    return;
  }

  const apiVersion = urlMatch[1];
  let requestedModel = urlMatch[2];
  if (requestedModel.includes('/')) {
    requestedModel = requestedModel.split('/').pop();
  }

  const action = urlMatch[3] || '';
  const queryString = urlMatch[4] || '';
  const queryParams = querystring.parse(queryString);

  let bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', async () => {
    const bodyBuffer = Buffer.concat(bodyChunks);

    const keys = getApiKeys();
    const requestKey = queryParams.key;
    if (requestKey && requestKey !== 'DUMMY_KEY' && !keys.includes(requestKey)) {
      keys.unshift(requestKey);
    }

    if (keys.length === 0) {
      console.error('[Proxy] Gemini request failed: No API keys configured.');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: {
          code: 401,
          message: 'No Gemini API keys configured in GEMINI_API_KEYS.',
          status: 'UNAUTHENTICATED'
        }
      }));
    }

    const modelsToTry = [requestedModel];
    for (const m of ALL_SEARCH_MODELS) {
      if (!modelsToTry.includes(m)) {
        modelsToTry.push(m);
      }
    }

    console.log(`[Proxy] Intercepted Gemini request for model: ${requestedModel}. Available keys: ${keys.length}. Models to try: ${modelsToTry.join(', ')}`);

    let lastResult = null;
    let success = false;
    let attemptCount = 0;

    for (const model of modelsToTry) {
      if (success) break;

      for (let i = 0; i < keys.length; i++) {
        attemptCount++;
        if (attemptCount > 15) {
          console.warn('[Proxy] Maximum retry attempts (15) reached.');
          break;
        }

        const keyIndex = (globalKeyCounter + i) % keys.length;
        const key = keys[keyIndex];
        const maskedKey = key.substring(0, 6) + '...' + key.substring(key.length - 4);

        console.log(`[Proxy] [Attempt ${attemptCount}] Trying model "${model}" with key "${maskedKey}"`);

        const params = { ...queryParams, key: key };

        try {
          const result = await makeGoogleRequest(apiVersion, model, action, params, bodyBuffer, req.headers, req.method);
          lastResult = result;

          if (result.statusCode === 200) {
            console.log(`[Proxy] [Success] Model "${model}" succeeded with key "${maskedKey}"`);
            globalKeyCounter = (keyIndex + 1) % keys.length;
            success = true;
            
            res.writeHead(result.statusCode, result.headers);
            res.end(result.body);
            break;
          } else {
            let errorMsg = '';
            try {
              const errObj = JSON.parse(result.body.toString());
              errorMsg = errObj.error?.message || result.body.toString().substring(0, 100);
            } catch (e) {
              errorMsg = result.body.toString().substring(0, 100);
            }
            console.warn(`[Proxy] [Failed] Model "${model}" failed with status ${result.statusCode}: ${errorMsg}`);
          }
        } catch (err) {
          console.error(`[Proxy] [Error] Network error during request: ${err.message}`);
          lastResult = {
            statusCode: 502,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({
              error: {
                code: 502,
                message: `Network error: ${err.message}`,
                status: 'BAD_GATEWAY'
              }
            }))
          };
        }
      }
    }

    if (!success) {
      console.error(`[Proxy] [All Attempts Failed] Could not complete the request.`);
      if (lastResult) {
        res.writeHead(lastResult.statusCode, lastResult.headers);
        res.end(lastResult.body);
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            code: 500,
            message: 'All Gemini API keys and models exhausted.',
            status: 'INTERNAL'
          }
        }));
      }
    }
  });
}

// Proxy server
const server = http.createServer((req, res) => {
  if (req.url === '/chromium-log') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (fs.existsSync('/home/node/chromium.log')) {
      return res.end(fs.readFileSync('/home/node/chromium.log'));
    } else {
      return res.end('chromium.log does not exist');
    }
  }

  if (req.url === '/openclaw-log') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    const logDir = '/home/node/.openclaw';
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
      if (files.length > 0) {
        const latestLog = files.map(f => ({ name: f, time: fs.statSync(path.join(logDir, f)).mtimeMs }))
                              .sort((a, b) => b.time - a.time)[0].name;
        return res.end(fs.readFileSync(path.join(logDir, latestLog)));
      }
    }
    return res.end('No openclaw log files found.');
  }

  if (req.url === '/process-status') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    const { execSync } = require('child_process');
    const http = require('http');
    
    // Check if Chromium port is reachable and query it
    http.get('http://127.0.0.1:18800/json/version', (res2) => {
      let data = '';
      res2.on('data', (chunk) => data += chunk);
      res2.on('end', () => {
        try {
          const psOutput = execSync('ps aux').toString();
          const safeEnv = Object.keys(process.env).filter(k => !/pass|key|token|auth/i.test(k)).map(k => `${k}=${process.env[k]}`).join('\n');
          return res.end(`CHROMIUM CDP RESPONSE:\n${data}\n\nPS AUX:\n${psOutput}\n\nENV:\n${safeEnv}`);
        } catch (e) {
          return res.end(`CHROMIUM CDP RESPONSE:\n${data}\n\nError checking PS: ${e.message}`);
        }
      });
    }).on('error', (err2) => {
      try {
        const psOutput = execSync('ps aux').toString();
        const safeEnv = Object.keys(process.env).filter(k => !/pass|key|token|auth/i.test(k)).map(k => `${k}=${process.env[k]}`).join('\n');
        return res.end(`CHROMIUM CDP ERROR: ${err2.message}\n\nPS AUX:\n${psOutput}\n\nENV:\n${safeEnv}`);
      } catch (e) {
        return res.end(`CHROMIUM CDP ERROR: ${err2.message}\n\nError checking PS: ${e.message}`);
      }
    });
    return;
  }
  if (req.url === '/test-network') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    const https = require('https');
    
    let result = 'Network Test Results:\n\n';
    
    const testUrl = (url, next) => {
      const start = Date.now();
      const req = https.get(url, (res2) => {
        const duration = Date.now() - start;
        result += `URL: ${url}\nStatus: ${res2.statusCode}\nTime taken: ${duration}ms\nHeaders: ${JSON.stringify(res2.headers).substring(0, 150)}\n\n`;
        next();
      });
      req.setTimeout(5000, () => {
        req.destroy(new Error('Timeout after 5000ms'));
      });
      req.on('error', (err) => {
        const duration = Date.now() - start;
        result += `URL: ${url}\nError: ${err.message}\nTime taken: ${duration}ms\n\n`;
        next();
      });
    };
    
    testUrl('https://1.1.1.1', () => {
      testUrl('https://www.google.com/', () => {
        testUrl('https://html.duckduckgo.com/', () => {
          testUrl('https://tw.search.yahoo.com/', () => {
            res.end(result);
          });
        });
      });
    });
    return;
  }

  if (req.url === '/test-browser') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    const http = require('http');
    
    // 1. Create a new tab (requires PUT method in newer Chromium)
    const reqTab = http.request('http://127.0.0.1:18800/json/new', { method: 'PUT' }, (jsonRes) => {
      let body = '';
      jsonRes.on('data', chunk => body += chunk);
      jsonRes.on('end', () => {
        try {
          const tabInfo = JSON.parse(body);
          const wsUrl = tabInfo.webSocketDebuggerUrl;
          if (!wsUrl) {
            return res.end(`Failed to get webSocketDebuggerUrl from tabInfo: ${body}`);
          }
          
          res.write(`New tab created. WebSocket URL: ${wsUrl}\nConnecting...\n`);
          
          // 2. Connect to WebSocket
          const ws = new WebSocket(wsUrl);
          
          ws.onopen = () => {
            res.write(`Connected! Sending Page.enable and Page.navigate...\n`);
            // Enable Page domain to receive lifecycle events
            ws.send(JSON.stringify({
              id: 1,
              method: 'Page.enable'
            }));
            // Navigate
            ws.send(JSON.stringify({
              id: 2,
              method: 'Page.navigate',
              params: { url: 'https://www.google.com/' }
            }));
          };
          
          let hasResponded = false;
          const timeout = setTimeout(() => {
            if (!hasResponded) {
              hasResponded = true;
              ws.close();
              res.end(`\nTimeout after 10 seconds waiting for navigation.`);
            }
          }, 10000);
          
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            res.write(`Received CDP event/response: ${JSON.stringify(msg).substring(0, 200)}\n`);
            
            // If page reports loadEventFired or navigate response is received
            if (msg.method === 'Page.loadEventFired' || (msg.id === 2 && msg.result)) {
              clearTimeout(timeout);
              if (!hasResponded) {
                hasResponded = true;
                ws.close();
                res.end(`\nNavigation completed successfully!`);
              }
            }
          };
          
          ws.onerror = (err) => {
            clearTimeout(timeout);
            if (!hasResponded) {
              hasResponded = true;
              res.end(`\nWebSocket error: ${err.message}`);
            }
          };
          
          ws.onclose = () => {
            clearTimeout(timeout);
            if (!hasResponded) {
              hasResponded = true;
              res.end(`\nWebSocket closed early.`);
            }
          };
          
        } catch (e) {
          res.end(`Error parsing JSON new tab response: ${e.message}\nBody: ${body}`);
        }
      });
    });
    
    reqTab.on('error', (err) => {
      res.end(`Failed to create new tab: ${err.message}`);
    });
    
    reqTab.end();
    return;
  }

  // Intercept Gemini API calls (only /models/... or /v1beta/..., keeping OpenClaw's completions clean)
  if (req.url.includes('/models/') || req.url.startsWith('/v1beta/')) {
    handleGeminiRequest(req, res);
    return;
  }

  // Check if it is a GET request to a media file path (potential screenshot download)
  const isMediaRequest = req.method === 'GET' && (
    req.url.includes('/media/') ||
    req.url.includes('/assistant-media/') ||
    req.url.includes('/workspace/')
  );

  if (isMediaRequest) {
    // Check if the requested file exists on disk (if it's a direct filename match)
    const filename = req.url.split('/').pop().split('?')[0];
    let exists = false;
    for (const dir of DIRS_TO_CHECK) {
      if (fs.existsSync(path.join(dir, filename))) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      console.log(`[Proxy] Requested media filename "${filename}" not found on disk. Attempting fallback to the latest screenshot.`);
      return serveLatestScreenshot(res);
    }
  }

  // Set up proxy request to the OpenClaw gateway process
  const options = {
    hostname: 'localhost',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // If OpenClaw gateway returns 404 for a GET request to a media directory, intercept it
    if (isMediaRequest && proxyRes.statusCode === 404) {
      console.log(`[Proxy] OpenClaw gateway returned 404 for media request: ${req.url}. Attempting fallback to the latest screenshot.`);
      return serveLatestScreenshot(res);
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy] Request forwarding error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server is running on port ${PORT}, forwarding requests to target port ${TARGET_PORT}`);
});
