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

async function main() {
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
  const query = 'What have I written about feeling anxious?';

  console.log('Calling /api/retrieval with real embeddings for query:', query);
  const resp1 = await fetch(`${base}/api/retrieval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ query, k: 5 }),
  });
  const json1 = await resp1.text();
  try { console.log('/api/retrieval response:', JSON.stringify(JSON.parse(json1), null, 2)); } catch (e) { console.log('/api/retrieval raw:', json1.slice(0,2000)); }

  console.log('\nCalling /api/rag/generate with real retrieval+generation');
  const resp2 = await fetch(`${base}/api/rag/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ question: query, k: 5 }),
  });
  const json2 = await resp2.text();
  try { console.log('/api/rag/generate response:', JSON.stringify(JSON.parse(json2), null, 2)); } catch (e) { console.log('/api/rag/generate raw:', json2.slice(0,2000)); }
}

main().catch((e)=>{ console.error('Test failed', e); process.exit(1); });
