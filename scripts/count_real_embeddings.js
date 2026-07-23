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
    const r = await pool.query("SELECT count(*)::int AS c FROM embeddings WHERE (metadata->>'synthetic') IS NULL");
    console.log('real_embeddings_count:', r.rows[0].c);
  } catch (e) {
    console.error('Query failed', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
