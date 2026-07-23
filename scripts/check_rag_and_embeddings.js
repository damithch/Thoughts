const fs = require('fs');
const { Pool } = require('pg');

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

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r1 = await pool.query('select count(*)::int as c from rag_documents');
    const r2 = await pool.query('select id, document_key, length(content) as len, substring(content,1,200) as sample from rag_documents order by id limit 10');
    const r3 = await pool.query('select count(*)::int as c from embeddings');
    const r4 = await pool.query('select id, document_key, chunk_index, length(chunk_text) as len from embeddings order by id limit 10');
    console.log('rag_documents count:', r1.rows[0].c);
    console.log('sample rag_documents:', JSON.stringify(r2.rows, null, 2));
    console.log('embeddings count:', r3.rows[0].c);
    console.log('sample embeddings:', JSON.stringify(r4.rows, null, 2));
  } catch (e) {
    console.error('DB check failed', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
