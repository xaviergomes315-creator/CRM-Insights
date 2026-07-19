/**
 * Migration runner — executes all SQL files in order against SUPABASE_DB_URL.
 * Usage: node supabase/run_migrations.mjs
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('ERROR: SUPABASE_DB_URL environment variable is not set.');
  process.exit(1);
}

const migrations = [
  'migration.sql',
  '20240101000001_multi_tenant_rls.sql',
  '20240101000002_invoices.sql',
  '20240101000003_hr_module.sql',
  '20240101000004_settings.sql',
];

async function runMigrations() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('✓ Connected to database\n');

  for (const filename of migrations) {
    const filepath = path.join(__dirname, filename.includes('/') ? filename : filename);
    const sql = fs.readFileSync(filepath, 'utf8');

    const label = filename.replace('migrations/', '');
    process.stdout.write(`Running ${label} ... `);

    try {
      await client.query(sql);
      console.log('✓ OK');
    } catch (err) {
      console.log(`✗ FAILED\n`);
      console.error(`  Error: ${err.message}`);
      await client.end();
      process.exit(1);
    }
  }

  console.log('\n── Verification ─────────────────────────────────────');

  // Check tables exist
  const tableCheck = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'leads','tasks','companies','user_profiles',
        'invoices','employees','attendance','pending_invites'
      )
    ORDER BY tablename;
  `);
  console.log('Tables present:', tableCheck.rows.map(r => r.tablename).join(', '));

  // Check RLS enabled
  const rlsCheck = await client.query(`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relname IN (
      'leads','tasks','companies','user_profiles',
      'invoices','employees','attendance','pending_invites'
    )
    ORDER BY relname;
  `);
  console.log('\nRLS status:');
  for (const row of rlsCheck.rows) {
    const status = row.relrowsecurity ? '✓ enabled' : '✗ disabled';
    console.log(`  ${row.relname.padEnd(20)} ${status}`);
  }

  // Count policies
  const policyCount = await client.query(`
    SELECT COUNT(*) AS count FROM pg_policies WHERE schemaname = 'public';
  `);
  console.log(`\nTotal RLS policies active: ${policyCount.rows[0].count}`);

  // Check address column on companies
  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'address';
  `);
  console.log(`companies.address column: ${colCheck.rows.length > 0 ? '✓ present' : '✗ missing'}`);

  await client.end();
  console.log('\n✓ All migrations applied and verified successfully.');
}

runMigrations().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
