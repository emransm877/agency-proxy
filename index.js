const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
// Raised from the 100kb default so image / PDF / APK uploads go through.
app.use(express.json({ limit: '25mb' }));

// Chat — forwards the whole body to Anthropic (so `tools` and `stream` pass through).
app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Image generation via the OpenAI image API.
// Needs OPENAI_API_KEY set on this service (from platform.openai.com — an API
// key, NOT a ChatGPT subscription). Optional IMAGE_MODEL (default gpt-image-1).
app.post('/api/image', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(501).json({ error: { message: 'Image generation not configured: add OPENAI_API_KEY to this service.' } });
  }
  try {
    const allowed = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
    const size = allowed.includes(req.body.size) ? req.body.size : '1024x1024';
    const prompt = String(req.body.prompt || '').slice(0, 4000);
    if (!prompt) return res.status(400).json({ error: { message: 'Missing prompt' } });
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({ model: process.env.IMAGE_MODEL || 'gpt-image-1', prompt, size, n: 1 })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { message: err.message } });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy running'));
