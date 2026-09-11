// Diagnostic & fix script for worry_experiment_days table
// Run: node scripts/fix-worry-schema.mjs

import { readFileSync } from 'fs';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)="?(.+?)"?\s*$/);
  if (match) process.env[match[1]] = match[2];
}

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  console.log('=== WORRY TABLE DIAGNOSTICS ===\n');

  // 1. Check what columns exist
  const { rows: cols } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'worry_experiment_days'
    ORDER BY ordinal_position
  `);
  console.log('Columns on worry_experiment_days:');
  for (const c of cols) {
    console.log(`  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default}`);
  }

  // 2. Check constraints
  const { rows: constraints } = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'worry_experiment_days'::regclass
  `);
  console.log('\nConstraints:');
  for (const c of constraints) {
    console.log(`  ${c.conname} (${c.contype}) → ${c.definition}`);
  }

  // 3. Check indexes
  const { rows: indexes } = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'worry_experiment_days'
  `);
  console.log('\nIndexes:');
  for (const i of indexes) {
    console.log(`  ${i.indexname} → ${i.indexdef}`);
  }

  // 4. Check existing data
  const { rows: dataSample } = await pool.query(`
    SELECT * FROM worry_experiment_days LIMIT 5
  `);
  console.log('\nSample data:');
  console.log(JSON.stringify(dataSample, null, 2));

  // ===== APPLY FIXES =====
  console.log('\n=== APPLYING FIXES ===\n');

  // Fix A: Add entry_date if missing
  const hasEntryDate = cols.some(c => c.column_name === 'entry_date');
  if (!hasEntryDate) {
    console.log('Adding entry_date column...');
    await pool.query(`ALTER TABLE worry_experiment_days ADD COLUMN entry_date DATE`);
    console.log('  ✓ Added entry_date column');
  } else {
    console.log('✓ entry_date column already exists');
  }

  // Fix B: Make day_number nullable (if exists)
  const hasDayNumber = cols.some(c => c.column_name === 'day_number');
  if (hasDayNumber) {
    console.log('Making day_number nullable...');
    try {
      await pool.query(`ALTER TABLE worry_experiment_days ALTER COLUMN day_number DROP NOT NULL`);
      console.log('  ✓ day_number is now nullable');
    } catch (e) {
      console.log('  (already nullable or error:', e.message, ')');
    }

    // Backfill entry_date
    console.log('Backfilling entry_date...');
    const { rowCount } = await pool.query(`
      UPDATE worry_experiment_days wed
      SET entry_date = (wpm.created_at::date + (wed.day_number - 1) * INTERVAL '1 day')::date
      FROM worry_postponement_modules wpm
      WHERE wed.module_id = wpm.id
        AND wed.entry_date IS NULL
    `);
    console.log(`  ✓ Backfilled ${rowCount} rows`);

    // Default remaining nulls
    const { rowCount: nullFixed } = await pool.query(`
      UPDATE worry_experiment_days SET entry_date = CURRENT_DATE WHERE entry_date IS NULL
    `);
    console.log(`  ✓ Fixed ${nullFixed} remaining nulls`);
  }

  // Fix C: Make entry_date NOT NULL
  try {
    await pool.query(`ALTER TABLE worry_experiment_days ALTER COLUMN entry_date SET NOT NULL`);
    await pool.query(`ALTER TABLE worry_experiment_days ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE`);
    console.log('✓ entry_date is NOT NULL with DEFAULT CURRENT_DATE');
  } catch (e) {
    console.log('entry_date NOT NULL:', e.message);
  }

  // Fix D: Drop ALL old day_number-related constraints
  for (const c of constraints) {
    if (c.definition.includes('day_number') || c.conname.includes('day_number')) {
      console.log(`Dropping constraint: ${c.conname}...`);
      try {
        await pool.query(`ALTER TABLE worry_experiment_days DROP CONSTRAINT IF EXISTS "${c.conname}"`);
        console.log(`  ✓ Dropped ${c.conname}`);
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  }

  // Fix E: Drop old day_number indexes
  for (const i of indexes) {
    if (i.indexdef.includes('day_number')) {
      console.log(`Dropping index: ${i.indexname}...`);
      try {
        await pool.query(`DROP INDEX IF EXISTS "${i.indexname}"`);
        console.log(`  ✓ Dropped ${i.indexname}`);
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  }

  // Fix F: Deduplicate (module_id, entry_date) before creating unique index
  console.log('Checking for duplicate (module_id, entry_date) pairs...');
  const { rows: dupes } = await pool.query(`
    SELECT module_id, entry_date, COUNT(*) as cnt
    FROM worry_experiment_days
    GROUP BY module_id, entry_date
    HAVING COUNT(*) > 1
  `);
  if (dupes.length > 0) {
    console.log(`  Found ${dupes.length} duplicate groups. Deduplicating...`);
    await pool.query(`
      DELETE FROM worry_experiment_days
      WHERE id NOT IN (
        SELECT MIN(id) FROM worry_experiment_days GROUP BY module_id, entry_date
      )
    `);
    console.log('  ✓ Duplicates removed (kept earliest)');
  } else {
    console.log('  ✓ No duplicates');
  }

  // Fix G: Create unique index on (module_id, entry_date)
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS worry_experiment_days_module_date_uniq
      ON worry_experiment_days (module_id, entry_date)
    `);
    console.log('✓ Unique index on (module_id, entry_date) exists');
  } catch (e) {
    console.log('Unique index error:', e.message);
  }

  // Fix H: Drop day_number column
  if (hasDayNumber) {
    console.log('Dropping day_number column...');
    try {
      await pool.query(`ALTER TABLE worry_experiment_days DROP COLUMN IF EXISTS day_number`);
      console.log('  ✓ day_number column dropped');
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }

  // ===== DO THE SAME FOR worry_postponed_items =====
  console.log('\n=== FIXING worry_postponed_items ===\n');

  const { rows: piCols } = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'worry_postponed_items'
    ORDER BY ordinal_position
  `);
  console.log('Columns:');
  for (const c of piCols) {
    console.log(`  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable}`);
  }

  const piHasDayNumber = piCols.some(c => c.column_name === 'day_number');
  const piHasEntryDate = piCols.some(c => c.column_name === 'entry_date');

  if (piHasDayNumber) {
    try { await pool.query(`ALTER TABLE worry_postponed_items ALTER COLUMN day_number DROP NOT NULL`); } catch {}
    if (!piHasEntryDate) {
      await pool.query(`ALTER TABLE worry_postponed_items ADD COLUMN entry_date DATE`);
    }
    await pool.query(`
      UPDATE worry_postponed_items wpi
      SET entry_date = (wpm.created_at::date + (wpi.day_number - 1) * INTERVAL '1 day')::date
      FROM worry_postponement_modules wpm
      WHERE wpi.module_id = wpm.id AND wpi.entry_date IS NULL
    `);
    await pool.query(`UPDATE worry_postponed_items SET entry_date = CURRENT_DATE WHERE entry_date IS NULL`);
    try {
      await pool.query(`ALTER TABLE worry_postponed_items ALTER COLUMN entry_date SET NOT NULL`);
      await pool.query(`ALTER TABLE worry_postponed_items ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE`);
    } catch {}

    // Drop day_number constraints
    const { rows: piConst } = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'worry_postponed_items'::regclass
        AND pg_get_constraintdef(oid) LIKE '%day_number%'
    `);
    for (const c of piConst) {
      try { await pool.query(`ALTER TABLE worry_postponed_items DROP CONSTRAINT IF EXISTS "${c.conname}"`); } catch {}
    }
    try { await pool.query(`DROP INDEX IF EXISTS idx_worry_postponed_items_module_day`); } catch {}
    await pool.query(`ALTER TABLE worry_postponed_items DROP COLUMN IF EXISTS day_number`);
    console.log('✓ worry_postponed_items fixed');
  } else {
    console.log('✓ worry_postponed_items already migrated');
  }

  // ===== VERIFY =====
  console.log('\n=== FINAL STATE ===\n');
  const { rows: finalCols } = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'worry_experiment_days'
    ORDER BY ordinal_position
  `);
  console.log('worry_experiment_days columns:');
  for (const c of finalCols) {
    console.log(`  ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default}`);
  }

  const { rows: finalIdx } = await pool.query(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'worry_experiment_days'
  `);
  console.log('Indexes:', finalIdx.map(i => i.indexname).join(', '));

  // Test INSERT
  console.log('\nTest upsert...');
  try {
    const { rows: [testMod] } = await pool.query(`
      SELECT id FROM worry_postponement_modules LIMIT 1
    `);
    if (testMod) {
      const { rows: [testRow] } = await pool.query(`
        INSERT INTO worry_experiment_days
          (module_id, entry_date, what_happened, thinking_time_notes, controllability)
        VALUES ($1, '2000-01-01'::date, 'test', 'test', 5)
        ON CONFLICT (module_id, entry_date)
        DO UPDATE SET what_happened = 'test-updated', updated_at = NOW()
        RETURNING id, entry_date, what_happened
      `, [testMod.id]);
      console.log('✓ Test upsert succeeded:', testRow);

      // Clean up test row
      await pool.query(`DELETE FROM worry_experiment_days WHERE module_id = $1 AND entry_date = '2000-01-01'`, [testMod.id]);
      console.log('✓ Test row cleaned up');
    } else {
      console.log('No modules found — skipping upsert test');
    }
  } catch (e) {
    console.error('✗ Test upsert FAILED:', e.message);
  }

  await pool.end();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
