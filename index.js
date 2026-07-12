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

// Image generation. Prefers Google Gemini (free tier at aistudio.google.com),
// falls back to OpenAI if only OPENAI_API_KEY is set. Always responds in the
// shape the app expects: { data: [ { b64_json } ] }.
app.post('/api/image', async (req, res) => {
  const prompt = String(req.body.prompt || '').slice(0, 4000);
  if (!prompt) return res.status(400).json({ error: { message: 'Missing prompt' } });

  try {
    // --- Google Gemini (free) ---
    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
      const gr = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      });
      const gd = await gr.json();
      if (!gr.ok) {
        return res.status(gr.status).json({ error: { message: (gd.error && gd.error.message) || ('Gemini HTTP ' + gr.status) } });
      }
      const parts = ((((gd.candidates || [])[0] || {}).content) || {}).parts || [];
      const img = parts.find(p => p.inlineData && p.inlineData.data) || parts.find(p => p.inline_data && p.inline_data.data);
      const b64 = img && (img.inlineData ? img.inlineData.data : img.inline_data.data);
      if (!b64) {
        const txt = parts.map(p => p.text).filter(Boolean).join(' ');
        return res.status(502).json({ error: { message: 'Gemini returned no image' + (txt ? ': ' + txt.slice(0, 160) : '. Try a more descriptive prompt.') } });
      }
      return res.json({ data: [{ b64_json: b64 }] });
    }

    // --- OpenAI (fallback) ---
    if (process.env.OPENAI_API_KEY) {
      const allowed = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
      const size = allowed.includes(req.body.size) ? req.body.size : '1024x1024';
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
        body: JSON.stringify({ model: process.env.IMAGE_MODEL || 'gpt-image-1', prompt, size, n: 1 })
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(501).json({ error: { message: 'Image generation not configured: add GEMINI_API_KEY (free at aistudio.google.com) or OPENAI_API_KEY to this service.' } });
  } catch (err) {
    res.status(502).json({ error: { message: err.message } });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy running'));
