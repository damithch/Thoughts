const fs = require('fs');
const crypto = require('crypto');

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

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function encodeSession(payload, secret) {
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(json);
  const signature = signValue(encoded, secret);
  return `${encoded}.${signature}`;
}

async function doRequests() {
  loadEnv();

  const AUTH_SECRET = process.env.AUTH_SECRET;
  if (!AUTH_SECRET) {
    console.error('AUTH_SECRET missing in .env.local');
    process.exit(1);
  }

  const userId = Number(process.env.MCP_USER_ID ?? '2');

  const payload = { userId, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 };
  const sessionValue = encodeSession(payload, AUTH_SECRET);

  const cookie = `thoughts_session=${sessionValue}`;

  const base = 'http://localhost:3000';

  console.log('Posting to /api/rag/documents to sync + ingest (this may call Gemini)...');
  const resp1 = await fetch(`${base}/api/rag/documents`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  const json1 = await resp1.json();
  console.log('/api/rag/documents response:', JSON.stringify(json1, null, 2));

  console.log('\nCalling /api/retrieval with query "mood"');
  const resp2 = await fetch(`${base}/api/retrieval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-use-synthetic-embedding': '1' },
    body: JSON.stringify({ query: 'mood', k: 5 }),
  });
  const json2 = await resp2.json();
  console.log('/api/retrieval response:', JSON.stringify(json2, null, 2));

  console.log('\nCalling /api/rag/generate with question "What does my journal say about my mood?"');
  const resp3 = await fetch(`${base}/api/rag/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-use-synthetic-embedding': '1' },
    body: JSON.stringify({ question: "What does my journal say about my mood?", k: 5 }),
  });
  const json3 = await resp3.json();
  console.log('/api/rag/generate response:', JSON.stringify(json3, null, 2));
}

// Run
(doRequests)().catch((e) => {
  console.error('Test run failed', e);
  process.exit(1);
});
