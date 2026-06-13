const https = require('https');
const querystring = require('querystring');

let globalKeyCounter = 0;

const ALL_SEARCH_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-3.1-pro',
  'gemini-2.5-pro',
  'gemini-1.5-flash'
];

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
  // Also check individual environment variables commonly used
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
    delete headers['authorization'];
    headers['content-type'] = headers['content-type'] || 'application/json';
    headers['accept'] = 'application/json';

    // Always use v1beta - newer models (gemini-3.1-flash-lite etc.) don't exist on v1
    const effectivePath = `/v1beta/models/${model}${action}?${querystring.stringify(queryParams)}`;

    const reqOpts = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: effectivePath,
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

async function handleGeminiRequest(req, res) {
  const urlMatch = req.url.match(/^(\/v1beta|\/v1)?\/models\/(.+?)(:[^?]+)?(?:\?(.*))?$/);
  if (!urlMatch) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'Invalid API URL pattern' } }));
  }

  const apiVersion = urlMatch[1] || '/v1beta';
  let requestedModel = urlMatch[2];
  if (requestedModel.includes('/')) {
    requestedModel = requestedModel.split('/').pop();
  }

  const action = urlMatch[3] || '';
  const queryString = urlMatch[4] || '';
  const queryParams = querystring.parse(queryString);

  const bodyBuffer = req.rawBody || Buffer.alloc(0);

  // Authenticate using the gateway password
  const gatewayPassword = process.env.OPENCLAW_GATEWAY_PASSWORD || process.env.GATEWAY_PASSWORD;
  const requestKey = queryParams.key;

  if (gatewayPassword && requestKey !== gatewayPassword) {
    console.warn(`[Proxy] Unauthorized access attempt with key: ${requestKey}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: {
        code: 403,
        message: 'Forbidden: Invalid gateway password key.',
        status: 'PERMISSION_DENIED'
      }
    }));
  }

  const keys = getApiKeys();
  // Remove the gateway password key before sending request to Google
  delete queryParams.key;

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

  let parsedBody = null;
  try {
    parsedBody = JSON.parse(bodyBuffer.toString());
    if (parsedBody && parsedBody.tools) {
      console.log(`[Proxy] Tools passed to model: ${JSON.stringify(parsedBody.tools)}`);
    }
  } catch (e) {
    // Ignore parse error
  }

  if (parsedBody) {
    // Inject safety settings to block nothing by default
    parsedBody.safetySettings = [
      { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" },
      { "category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "BLOCK_NONE" }
    ];
  }

  const hasGrounding = parsedBody && parsedBody.tools && parsedBody.tools.some(t => t.googleSearch || t.googleSearchRetrieval);

  const modelsToTry = [];
  const requestedModelSupportsGrounding = !requestedModel.includes('3.1-flash-lite');

  if (hasGrounding) {
    if (requestedModelSupportsGrounding) {
      modelsToTry.push(requestedModel);
    }
    for (const m of ALL_SEARCH_MODELS) {
      const mSupportsGrounding = !m.includes('3.1-flash-lite');
      if (mSupportsGrounding && !modelsToTry.includes(m)) {
        modelsToTry.push(m);
      }
    }
  } else {
    modelsToTry.push(requestedModel);
    for (const m of ALL_SEARCH_MODELS) {
      if (!modelsToTry.includes(m)) {
        modelsToTry.push(m);
      }
    }
  }

  console.log(`[Proxy] Intercepted Gemini request for model: ${requestedModel}. Has grounding: ${!!hasGrounding}. Available keys: ${keys.length}. Models to try: ${modelsToTry.join(', ')}`);

  let lastResult = null;
  let success = false;
  let attemptCount = 0;

  for (const model of modelsToTry) {
    if (success) break;

    const modelSupportsGrounding = !model.includes('3.1-flash-lite');
    const configs = [];
    if (hasGrounding && modelSupportsGrounding) {
      configs.push({ useGrounding: true });
    }
    configs.push({ useGrounding: false });

    for (const config of configs) {
      if (success) break;

      let activeBodyBuffer = bodyBuffer;
      if (parsedBody) {
        const bodyToSerialize = { ...parsedBody };
        if (hasGrounding && !config.useGrounding) {
          if (bodyToSerialize.tools) {
            bodyToSerialize.tools = bodyToSerialize.tools.filter(t => !t.googleSearch && !t.googleSearchRetrieval);
            if (bodyToSerialize.tools.length === 0) {
              delete bodyToSerialize.tools;
            }
          }
        } else if (hasGrounding && config.useGrounding) {
          bodyToSerialize.tools = bodyToSerialize.tools || [];
          if (!bodyToSerialize.tools.some(t => t.googleSearch || t.googleSearchRetrieval)) {
            bodyToSerialize.tools.push({ googleSearch: {} });
          }
        }
        activeBodyBuffer = Buffer.from(JSON.stringify(bodyToSerialize));
      }

      for (let i = 0; i < keys.length; i++) {
        attemptCount++;
        if (attemptCount > 20) {
          console.warn('[Proxy] Maximum retry attempts (20) reached.');
          break;
        }

        const keyIndex = (globalKeyCounter + i) % keys.length;
        const key = keys[keyIndex];
        const maskedKey = key.substring(0, 6) + '...' + key.substring(key.length - 4);

        console.log(`[Proxy] [Attempt ${attemptCount}] Trying model "${model}" (grounding=${config.useGrounding}) with key "${maskedKey}"`);

        const params = { ...queryParams, key: key };

        try {
          const result = await makeGoogleRequest(apiVersion, model, action, params, activeBodyBuffer, req.headers, req.method);
          lastResult = result;

          if (result.statusCode === 200) {
            console.log(`[Proxy] [Success] Model "${model}" (grounding=${config.useGrounding}) succeeded with key "${maskedKey}"`);
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
            console.warn(`[Proxy] [Failed] Model "${model}" (grounding=${config.useGrounding}) failed with status ${result.statusCode}: ${errorMsg}`);
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
}

module.exports = {
  handleGeminiRequest
};
