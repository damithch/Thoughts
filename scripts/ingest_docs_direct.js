const fs = require('fs');
const fetch = global.fetch ?? require('node-fetch');
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

function chunkText(text, maxChars = 1500, overlap = 200) {
  const chunks = [];
  if (!text || !text.length) return chunks;
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function embedTextsDirect(texts) {
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'embed-text-001';
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedText`;
  const body = { text: texts };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embed API error: ${res.status} ${t}`);
  }

  const json = await res.json();

  const embeddings = [];
  if (Array.isArray(json.embeddings)) {
    for (const e of json.embeddings) embeddings.push(e.embedding ?? e.vector ?? []);
  } else if (Array.isArray(json.data)) {
    for (const item of json.data) embeddings.push(item.embedding ?? item.vector ?? []);
  } else if (json.embedding) {
    embeddings.push(json.embedding);
  }

  return embeddings;
}

(async () => {
  loadEnv();
  const userId = Number(process.env.MCP_USER_ID || '2');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query('select id, document_key, source_entity_id, content, metadata from rag_documents where user_id = $1', [userId]);
    console.log('Found', rows.length, 'documents for user', userId);

    let totalChunks = 0;

    for (const doc of rows) {
      const chunks = chunkText(doc.content || '', 1500, 300);
      if (chunks.length === 0) continue;
      try {
        const embeddings = await embedTextsDirect(chunks);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const emb = embeddings[i] || [];
          const embStr = `[${emb.join(',')} ]`;
          await pool.query(
            `INSERT INTO embeddings (user_id, document_key, source_entity_id, chunk_index, chunk_text, embedding, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, NOW())
             ON CONFLICT (user_id, document_key, chunk_index)
             DO UPDATE SET chunk_text = EXCLUDED.chunk_text, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, created_at = NOW()`,
            [userId, doc.document_key, String(doc.source_entity_id), i, chunk, embStr, JSON.stringify(doc.metadata || {})],
          );
        }
        totalChunks += chunks.length;
        console.log('Ingested', chunks.length, 'chunks for', doc.document_key);
      } catch (e) {
        console.error('Failed embedding for', doc.document_key, e.message || e);
      }
    }

    const { rows: r2 } = await pool.query('select count(*)::int as c from embeddings where user_id = $1', [userId]);
    console.log('Total ingested chunks (db):', r2[0].c, 'script counted:', totalChunks);
  } catch (e) {
    console.error('Ingestion failed', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
