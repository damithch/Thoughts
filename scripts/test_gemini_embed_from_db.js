const fs = require('fs');
const { Pool } = require('pg');

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query('select id, document_key, content from rag_documents order by id limit 1');
    if (!r.rows || r.rows.length === 0) {
      console.error('No rag_documents found');
      process.exit(1);
    }

    const doc = r.rows[0];
    console.log('Testing embed for document_key=', doc.document_key, 'len=', doc.content.length);

    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;

    const body = { content: { parts: [{ text: doc.content }] } };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    console.log('Status:', resp.status);
    try {
      console.log('JSON response:', JSON.stringify(JSON.parse(text), null, 2));
    } catch (e) {
      console.log('Raw response:', text.slice(0, 2000));
    }
  } catch (e) {
    console.error('Error', e);
  } finally {
    await pool.end();
  }
}

main();
