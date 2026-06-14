const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`[Setsuna Proxy Server] Incoming ${req.method} request to: ${req.url}`);
  next();
});

// Import the gemini proxy handler
const { handleGeminiRequest } = require('./gemini-proxy');

// Raw body parser middleware for Gemini proxy paths
app.use((req, res, next) => {
  const isGeminiPath = req.url.includes('/models/') || req.url.startsWith('/v1beta/') || req.url.startsWith('/v1/');
  if (isGeminiPath) {
    let chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      next();
    });
  } else {
    next();
  }
});

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// Proxy routes for Gemini API
app.all(['/v1beta/models/*', '/v1/models/*', '/models/*'], async (req, res) => {
  try {
    await handleGeminiRequest(req, res);
  } catch (err) {
    console.error('[Setsuna Proxy Server Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

const port1 = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const port2 = 3000;

const server1 = app.listen(port1, '0.0.0.0', () => {
  console.log(`Keep-alive and Gemini Proxy server listening on port ${port1}`);
});
server1.on('error', (err) => {
  console.error(`Error starting server on port ${port1}:`, err.message);
});

if (port1 !== port2) {
  const server2 = app.listen(port2, '0.0.0.0', () => {
    console.log(`Fallback listener running on port ${port2}`);
  });
  server2.on('error', (err) => {
    console.warn(`Could not start fallback listener on port ${port2}:`, err.message);
  });
}
