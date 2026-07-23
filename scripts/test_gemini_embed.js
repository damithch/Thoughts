const fs = require('fs');

function loadEnv() {
  const content = fs.readFileSync('.env.local', 'utf8');
  content.split(/\r?\n/).forEach((l) => {
    if (!l || l.trim().startsWith('#')) return;
    const i = l.indexOf('=');
    if (i === -1) return;
    const k = l.slice(0, i);
    let v = l.slice(i + 1);
    v = v.replace(/^"|"$/g, '');
    process.env[k] = v;
  });
}

async function main() {
  loadEnv();
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error('GEMINI_API_KEY / GOOGLE_API_KEY not set in .env.local');
    process.exit(1);
  }

  const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;

  const sample = "Hello world. This is a short test for embeddings.";
  const body = { content: { parts: [{ text: sample }] } };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
      body: JSON.stringify(body),
      // set a generous timeout via AbortController if desired
    });

    const text = await resp.text();
    console.log('Status:', resp.status);
    try {
      console.log('JSON response:', JSON.stringify(JSON.parse(text), null, 2));
    } catch (e) {
      console.log('Raw response:', text.slice(0, 2000));
    }
  } catch (e) {
    console.error('Request failed', e);
    process.exit(1);
  }
}

main();
