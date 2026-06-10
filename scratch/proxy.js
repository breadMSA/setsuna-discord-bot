const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 18789;
const TARGET_PORT = 18790;
const DIRS_TO_CHECK = [
  '/home/node/.openclaw/media/browser',
  '/home/node/.openclaw/workspace/media',
  '/home/node/.openclaw/media'
];

console.log('Starting OpenClaw gateway wrapper on port:', PORT);

// Start OpenClaw gateway on TARGET_PORT
const openclaw = spawn('node', ['openclaw.mjs', 'gateway', '--allow-unconfigured', '--port', String(TARGET_PORT)], {
  stdio: 'inherit',
  shell: true
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

// Proxy server
const server = http.createServer((req, res) => {
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
