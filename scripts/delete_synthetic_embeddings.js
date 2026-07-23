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
    const res = await pool.query("DELETE FROM embeddings WHERE metadata->>'synthetic' = 'true' OR chunk_text = 'synthetic' RETURNING id");
    console.log('Deleted synthetic embeddings count:', res.rowCount);
  } catch (e) {
    console.error('Delete failed', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
