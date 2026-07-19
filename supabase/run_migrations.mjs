/**
 * Migration runner — uses Supabase Management API (HTTPS) to execute SQL.
 * Usage: node supabase/run_migrations.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const ACCESS_TOKEN  = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN must be set.');
  process.exit(1);
}

const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const API_BASE   = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

console.log(`Project ref : ${projectRef}`);
console.log(`API endpoint: ${API_BASE}\n`);

async function runSql(sql) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return text;
}

async function step(label, sql, { ignoreError = false } = {}) {
  process.stdout.write(`    ${label} … `);
  try {
    await runSql(sql);
    console.log('✓');
    return true;
  } catch (err) {
    const short = err.message.replace(/\n/g, ' ').slice(0, 160);
    if (ignoreError) {
      console.log(`⚠ skipped (${short})`);
      return false;
    }
    console.log('✗ FAILED');
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

async function runFile(label, relPath) {
  const sql = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
  process.stdout.write(`▸ ${label}\n  → `);
  try {
    await runSql(sql);
    console.log('✓ Applied\n');
  } catch (err) {
    console.log('✗ FAILED\n');
    console.error(`  ${err.message}\n`);
    process.exit(1);
  }
}

async function runAll() {

  // ── 1. Base migration ──────────────────────────────────────────────────────
  await runFile(
    'migration.sql            (base: leads + tasks)',
    'migration.sql'
  );

  // ── 2. Pre-flight: fix legacy user_role type BEFORE running 00001 ──────────
  // Strategy:
  //   a) Convert user_profiles.role to TEXT first (breaks type dependency safely)
  //   b) Drop the legacy user_role type (now no columns depend on it)
  //   c) Drop stale helper functions (will be recreated by 00001)
  // Steps marked ignoreError:true are no-ops when the legacy schema isn't present.
  console.log('▸ Pre-flight: legacy schema cleanup');

  // a) Remove DEFAULT that references user_role so ALTER TYPE won't choke on it
  await step(
    'drop role DEFAULT on user_profiles (removes type dependency)',
    `ALTER TABLE public.user_profiles ALTER COLUMN role DROP DEFAULT;`,
    { ignoreError: true }
  );

  // b) Change column type to TEXT — breaks the user_role dependency without CASCADE
  await step(
    'convert user_profiles.role → TEXT (decouple from user_role enum)',
    `ALTER TABLE public.user_profiles ALTER COLUMN role TYPE TEXT USING role::TEXT;`,
    { ignoreError: true }
  );

  // c) Now drop the legacy type safely (no CASCADE needed)
  await step(
    'drop legacy user_role type',
    `DROP TYPE IF EXISTS public.user_role;`,
    { ignoreError: false }
  );

  // d) Re-add role column if it was wiped by the CASCADE drop of user_role
  //    (ALTER TABLE ... ADD COLUMN IF NOT EXISTS is safe when the column already exists)
  await step(
    'restore user_profiles.role column as app_role (if missing due to CASCADE)',
    `ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'employee';`,
    { ignoreError: false }
  );

  // e) Drop helper functions so 00001 can CREATE OR REPLACE with new signatures
  await step(
    'drop get_my_role helper function',
    `DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;`,
    { ignoreError: false }
  );
  await step(
    'drop get_my_company_id helper function',
    `DROP FUNCTION IF EXISTS public.get_my_company_id() CASCADE;`,
    { ignoreError: false }
  );

  console.log();

  // ── 3. Main migrations ─────────────────────────────────────────────────────
  await runFile(
    '00001_multi_tenant_rls   (companies, profiles, RLS)',
    'migrations/20240101000001_multi_tenant_rls.sql'
  );

  // ── 4. Post-00001 fixup: restore role column to app_role enum ─────────────
  // The CREATE TABLE IF NOT EXISTS in 00001 was a no-op (table existed),
  // so role is still TEXT.  Re-apply the correct type + default now.
  console.log('▸ Post-00001 fixup: restore role column type');
  await step(
    'alter user_profiles.role TEXT → app_role (skip if already correct / policies prevent it)',
    `ALTER TABLE public.user_profiles ALTER COLUMN role TYPE public.app_role USING role::TEXT::public.app_role;`,
    { ignoreError: true }
  );
  await step(
    'restore DEFAULT employee on role column (skip if already set)',
    `ALTER TABLE public.user_profiles ALTER COLUMN role SET DEFAULT 'employee'::public.app_role;`,
    { ignoreError: true }
  );
  console.log();

  // ── 5. Remaining migrations ────────────────────────────────────────────────
  await runFile(
    '00002_invoices           (invoices table + RLS)',
    'migrations/20240101000002_invoices.sql'
  );
  await runFile(
    '00003_hr_module          (employees, attendance + RLS)',
    'migrations/20240101000003_hr_module.sql'
  );
  await runFile(
    '00004_settings           (address col, pending_invites)',
    'migrations/20240101000004_settings.sql'
  );

  // ── Verification ───────────────────────────────────────────────────────────
  console.log('── Verification ──────────────────────────────────────────────\n');

  const tables = JSON.parse(await runSql(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('leads','tasks','companies','user_profiles','invoices','employees','attendance','pending_invites')
    ORDER BY tablename;
  `));
  const tableNames = tables.map(r => r.tablename);
  const expected   = ['attendance','companies','employees','invoices','leads','pending_invites','tasks','user_profiles'];
  const missing    = expected.filter(t => !tableNames.includes(t));

  console.log('Tables present     :', tableNames.join(', '));
  if (missing.length) console.warn('  ⚠ Missing:', missing.join(', '));
  else                console.log('  ✓ All 8 expected tables found');

  const rlsRows = JSON.parse(await runSql(`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('leads','tasks','companies','user_profiles','invoices','employees','attendance','pending_invites')
    ORDER BY relname;
  `));
  console.log('\nRLS status:');
  let allRlsOk = true;
  for (const row of rlsRows) {
    if (!row.relrowsecurity) allRlsOk = false;
    console.log(`  ${row.relname.padEnd(22)} ${row.relrowsecurity ? '✓ enabled' : '✗ DISABLED'}`);
  }

  const policyCount = JSON.parse(await runSql(
    `SELECT COUNT(*)::int AS count FROM pg_policies WHERE schemaname = 'public';`
  ))[0].count;
  console.log(`\nRLS policies active: ${policyCount}`);

  const addrRows = JSON.parse(await runSql(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='address';
  `));
  console.log(`companies.address  : ${addrRows.length > 0 ? '✓ present' : '✗ MISSING'}`);

  const constraintRows = JSON.parse(await runSql(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='pending_invites' AND constraint_type='UNIQUE';
  `));
  const hasUnique = constraintRows.some(r => r.constraint_name === 'pending_invites_company_email_unique');
  console.log(`pending_invites unique: ${hasUnique ? '✓ present' : '✗ MISSING'}`);

  // Verify role column type is app_role
  const roleTypeRows = JSON.parse(await runSql(`
    SELECT udt_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_profiles' AND column_name='role';
  `));
  const roleType = roleTypeRows[0]?.udt_name ?? 'unknown';
  console.log(`user_profiles.role type: ${roleType === 'app_role' ? '✓ app_role' : `✗ ${roleType} (expected app_role)`}`);

  console.log('\n' + (allRlsOk && missing.length === 0
    ? '✓ All migrations applied and verified successfully.'
    : '⚠ Some checks failed — review output above.'));
}

runAll().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
