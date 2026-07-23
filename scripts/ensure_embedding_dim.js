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
    const targetDim = Number(process.env.EMBEDDING_DIM || 3072);
    console.log('Target embedding dim:', targetDim);

    const idxRes = await pool.query("select indexname, indexdef from pg_indexes where tablename='embeddings'");
    console.log('Existing indexes on embeddings:', JSON.stringify(idxRes.rows, null, 2));

    // Drop any existing ivfflat indexes (they will be recreated)
    for (const r of idxRes.rows) {
      if (r.indexdef && r.indexdef.includes('ivfflat')) {
        console.log('Dropping index', r.indexname);
        await pool.query(`DROP INDEX IF EXISTS ${r.indexname}`);
      }
    }

    // Alter column type
    console.log('Altering column type to vector(' + targetDim + ')');
    await pool.query(`ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(${targetDim})`);

    // Recreate ivfflat index
    console.log('Creating new ivfflat index embeddings_embedding_idx');
    await pool.query(`CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings USING ivfflat (embedding) WITH (lists = 100)`);

    console.log('Done.');
  } catch (e) {
    console.error('DB operation failed', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
