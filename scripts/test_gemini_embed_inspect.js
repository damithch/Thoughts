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
    const doc = r.rows[0];

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
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.log('Response is not JSON');
      console.log(text.slice(0, 2000));
      process.exit(1);
    }

    console.log('Response type:', typeof parsed);
    console.log('Is array:', Array.isArray(parsed));
    if (Array.isArray(parsed)) {
      console.log('Array length:', parsed.length);
      console.log('First 10 elements:', parsed.slice(0, 10));
    } else {
      console.log('Keys:', Object.keys(parsed));
      console.log('Type of parsed.embedding:', typeof parsed.embedding);
      if (parsed.embedding) {
        try {
          if (Array.isArray(parsed.embedding)) {
            console.log('parsed.embedding is array, length:', parsed.embedding.length);
            console.log('First 10 embedding elements:', parsed.embedding.slice(0, 10));
          } else {
            console.log('parsed.embedding (non-array) preview:', JSON.stringify(parsed.embedding).slice(0, 200));
            if (parsed.embedding && Array.isArray(parsed.embedding.values)) {
              console.log('parsed.embedding.values length:', parsed.embedding.values.length);
            }
          }
        } catch (e) {
          console.log('Could not inspect parsed.embedding', e);
        }
      }
      if (parsed.embeddings) {
        console.log('parsed.embeddings[0] keys:', Object.keys(parsed.embeddings[0] || {}));
        console.log('parsed.embeddings[0].embedding length:', parsed.embeddings[0]?.embedding?.length);
      }
      if (parsed.data) {
        console.log('parsed.data[0] keys:', Object.keys(parsed.data[0] || {}));
        console.log('parsed.data[0].embedding length:', parsed.data[0]?.embedding?.length);
      }
    }
  } catch (e) {
    console.error('Error', e);
  } finally {
    await pool.end();
  }
}

main();
