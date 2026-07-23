const fs = require('fs');
const crypto = require('crypto');
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

function syntheticEmbedding(key, dim = 1536) {
  const hash = crypto.createHash('sha256').update(key).digest(); // 32 bytes
  const vals = [];
  for (let i = 0; i < dim; i++) {
    const byte = hash[i % hash.length];
    vals.push((byte / 255).toFixed(6));
  }
  return vals; // array of strings
}

(async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query('select id, document_key, source_entity_id from rag_documents where user_id = $1 order by id', [Number(process.env.MCP_USER_ID || '2')]);
    console.log('Seeding synthetic embeddings for', rows.length, 'documents');
    let inserted = 0;
    for (const doc of rows) {
      const emb = syntheticEmbedding(doc.document_key, 1536);
      const embStr = `[${emb.join(',') } ]`;
      await pool.query(
        `INSERT INTO embeddings (user_id, document_key, source_entity_id, chunk_index, chunk_text, embedding, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, NOW())
         ON CONFLICT (user_id, document_key, chunk_index)
         DO UPDATE SET chunk_text = EXCLUDED.chunk_text, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, created_at = NOW()`,
        [Number(process.env.MCP_USER_ID || '2'), doc.document_key, String(doc.source_entity_id), 0, 'synthetic', embStr, JSON.stringify({ synthetic: true })],
      );
      inserted++;
    }
    const { rows: r2 } = await pool.query('select count(*)::int as c from embeddings where user_id = $1', [Number(process.env.MCP_USER_ID || '2')]);
    console.log('Inserted', inserted, 'synthetic embeddings. DB reports', r2[0].c, 'rows for user.');
  } catch (e) {
    console.error('Seeding failed', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
