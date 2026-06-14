const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

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

app.listen(port, '0.0.0.0', () => {
  console.log(`Keep-alive and Gemini Proxy server listening on port ${port}`);
});
