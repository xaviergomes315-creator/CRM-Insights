# CRM Regression Audit Report
**Post-Universal Business Foundation Changes**
**Generated:** 2026-07-21
**Scope:** Full regression test covering Authentication, Modules, CRUD, RLS, API, Builds, Browser Console, Backend Logs.
**Methodology:** Build verification, TypeScript static analysis, source-code audit, runtime log analysis, browser console inspection, migration review, schema cross-reference.

---

## Executive Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 3 |
| 🟠 High | 6 |
| 🟡 Medium | 7 |
| 🟢 Low | 5 |
| 🎨 UI | 4 |
| ⚡ Performance | 3 |
| 🔒 Security | 3 |
| **Total** | **31** |

**Build status:**
- `@workspace/crm-dashboard` (Vite) — ✅ Production build passes
- `@workspace/api-server` (esbuild) — ✅ Production build passes
- `@workspace/db` TypeScript strict check — ❌ 10+ type errors (Zod v4 incompatibility)
- `@workspace/api-server` TypeScript strict check — ❌ 5 type errors
- `@workspace/crm-dashboard` TypeScript strict check — ✅ Passes

---

## 🔴 Critical Bugs

---

### CRIT-01 — Frontend Completely Broken: `supabaseUrl is required` crashes app at startup

**Affected Module:** Authentication, All modules (entire app)
**File:** `artifacts/crm-dashboard/src/lib/supabase.ts` — line 21
**Evidence:** Browser console log, workflow log

```
[error] supabaseUrl is required.
Error: supabaseUrl is required.
  at new SupabaseClient (…@supabase_supabase-js.js:19971)
  at /home/runner/workspace/artifacts/crm-dashboard/src/lib/supabase.ts:21:25
```

**Root Cause:**
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not present as Replit Secrets. The file logs a `console.error` warning on lines 14–19 but then still passes `undefined ?? ""` to `createClient()`, which throws because the Supabase SDK v2 validates that the URL is a non-empty string before construction completes.

```typescript
// supabase.ts:21 — createClient throws when url is undefined
export const supabase = createClient(url ?? "", key ?? "");
```

**Impact:** The entire frontend is a blank white screen. No user can log in, sign up, or access any module.

**Reproduction Steps:**
1. Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Replit Secrets (or run in a fresh environment).
2. Start the `crm-dashboard: web` workflow.
3. Open the app URL.
4. Observe blank white screen and browser console error.

**Recommended Fix:**
Replace the `createClient(url ?? "", key ?? "")` call with a guard that renders a user-facing error page when credentials are absent:

```typescript
// supabase.ts
if (!url || !key) {
  // Render an error banner; do NOT call createClient with empty strings.
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. Add them as Replit Secrets.");
}
export const supabase = createClient(url, key);
```
Add a React error boundary in `App.tsx` to catch this and display a setup instructions page instead of a blank screen.

---

### CRIT-02 — WhatsApp Queue Processor Floods Backend Logs at 30 Errors/Minute

**Affected Module:** WhatsApp
**File:** `artifacts/api-server/src/lib/whatsapp-queue-processor.ts` — lines 151–159; `artifacts/api-server/src/lib/supabase.ts` — lines 47–60
**Evidence:** API Server workflow log (700+ identical lines observed in one session)

```
[wa-queue] claim error: TypeError: fetch failed
[wa-queue] claim error: TypeError: fetch failed
... (repeating every 2 seconds indefinitely)
```

**Root Cause:**
The WhatsApp queue processor calls `supabase.rpc("claim_next_wa_queue_item")` every 2 seconds. The API server's Supabase client reads `process.env["VITE_SUPABASE_URL"]` (line 47). When this secret is absent, the client falls back to `https://placeholder.supabase.co` (line 57), which is an unreachable host. Every tick fails with a network error, which is logged but the interval is never stopped.

The processor has no back-off, no exponential retry, and no circuit breaker — it fires unconditionally regardless of repeated network failures.

**Impact:**
- Log files grow unboundedly (~86,400 error entries per day).
- CPU and network I/O wasted on guaranteed-to-fail fetches.
- Real errors are buried in noise, making production debugging impossible.
- If logging is shipped to a paid sink (Datadog, Papertrail, etc.) this incurs cost.

**Reproduction Steps:**
1. Ensure `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_URL` is absent.
2. Start the `api-server: API Server` workflow.
3. Observe backend logs — `[wa-queue] claim error: TypeError: fetch failed` appears every 2 seconds.

**Recommended Fix:**
1. Add a startup credentials check in `startQueueProcessor()`: if `VITE_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is unset, log one warning and return without starting the interval.
2. Add exponential back-off inside `tick()` with a cap (e.g., max 60-second wait after 5 consecutive failures).
3. Add a circuit breaker: after N consecutive failures, stop the interval and emit a single `[wa-queue] CIRCUIT OPEN` log.

---

### CRIT-03 — TypeScript Type Errors in `@workspace/db` (Zod v4 API Break)

**Affected Module:** Database schema, Drizzle ORM layer
**Files:**
- `lib/db/src/schema/companies.ts` — lines 83–89
- `lib/db/src/schema/business-configuration.ts` — lines 160–184
**Evidence:** `pnpm --filter @workspace/db exec tsc --noEmit`

```
src/schema/companies.ts(83,3): error TS2322: Type 'ZodDefault<ZodEnum<...>>' is not assignable to
  type 'ZodType<unknown, unknown, $ZodTypeInternals<...>>'
  ...missing properties: def, type, check, clone, and 6 more.

src/schema/business-configuration.ts(160,5): error TS2322: Type 'ZodRecord<...>' is not assignable
  to type 'ZodType<unknown, unknown, $ZodTypeInternals<...>>'
```

**Root Cause:**
The Drizzle ORM `.$type()` and `.customType()` column helpers expect Zod v3 schema instances (`_type`, `_parse`, `_getType`, `_getOrReturnCtx`). The project has upgraded to Zod v4 (which uses `$ZodTypeInternals` internals with different property names). Drizzle's type inference for JSONB columns using Zod schemas breaks at the TS level.

The `business_type`, `currency_code`, `locale` columns added in Phase 1 (`lib/db/src/schema/companies.ts` lines 83–86) all use `z.enum(...).default(...)` as their Drizzle column validators — these fail the TS check. The Zod schemas for all five JSONB columns in `lib/db/src/schema/business-configuration.ts` have the same issue.

**Impact:**
- `tsc --noEmit` fails — any CI pipeline will break.
- Drizzle type inference for the Phase 1 and Phase 2 columns is unreliable at compile time.
- The esbuild production build passes (esbuild does not type-check) which masks the error in CI-less environments.

**Reproduction Steps:**
```bash
pnpm --filter @workspace/db exec tsc --noEmit
# Observe 10+ TS2322 / TS2344 errors
```

**Recommended Fix:**
Pin Zod to v3 (`"zod": "^3.23.8"`) across the workspace, or upgrade Drizzle ORM to a version that supports Zod v4 inference. If staying on Zod v4, replace `.$type<T>()` column calls with manual TypeScript casts and use Zod v4 schemas only for runtime validation, not as Drizzle column type arguments.

---

## 🟠 High Priority Bugs

---

### HIGH-01 — API Server Reads `VITE_SUPABASE_URL` (Vite-scoped Variable) for Server-Side Client

**Affected Module:** All API routes, WhatsApp queue, AI assistant
**File:** `artifacts/api-server/src/lib/supabase.ts` — line 47

```typescript
const url = process.env["VITE_SUPABASE_URL"]?.trim() ?? "";
```

**Root Cause:**
`VITE_` prefix environment variables are a Vite convention for browser-bundled code. They are injected at build time via `import.meta.env` in the frontend. Using `process.env["VITE_SUPABASE_URL"]` in a Node.js/Express server only works if the same secret name is also exposed as a plain `process.env` variable. This is fragile and confusing — it couples the backend secret name to a frontend naming convention.

**Impact:**
- If the secret is ever renamed to the correct server-side convention (`SUPABASE_URL`), the API server silently falls back to the placeholder client and all DB operations fail.
- Causes CRIT-02 (queue flood) in environments where the secret is not explicitly set with the `VITE_` prefix.

**Recommended Fix:**
In `artifacts/api-server/src/lib/supabase.ts` line 47, read a dedicated server-side variable:

```typescript
const url = (process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "").trim();
```

Then add `SUPABASE_URL` as a Replit Secret alongside `VITE_SUPABASE_URL` (pointing to the same value), and update the warning message accordingly.

---

### HIGH-02 — `business_configuration.business_type` Not Synced When `companies.business_type` Changes

**Affected Module:** Settings, Business Configuration Engine
**Files:**
- `supabase/migrations/20240101000028_business_configuration.sql` — table has `business_type TEXT` column (line 26) that is a denormalized copy of `companies.business_type`
- `artifacts/crm-dashboard/src/pages/SettingsPage.tsx` — lines 245–252 update `companies` but not `business_configuration`

**Root Cause:**
The `business_configuration` table stores its own `business_type` column (line 26) which is populated once at INSERT time by the trigger. When an admin changes the company's business type in Settings (`SettingsPage.tsx` line 244: `UPDATE companies SET business_type = ...`), there is no trigger, foreign key cascade, or application code to update `business_configuration.business_type`. The two columns silently diverge.

**Impact:**
- `getAvailableModules()` and `getVisibleModules()` in the module registry read `business_configuration.business_type`, not `companies.business_type`.
- After a business type change in Settings, `getVisibleModules()` continues returning the old type's module set.
- The backend service `artifacts/api-server/src/lib/business-configuration.ts` also reads the stale value.
- Module gating (Phase 3/4) will be wrong for any company that changes their business type.

**Reproduction Steps:**
1. Log in as company_admin.
2. Go to Settings → Business Identity.
3. Change Business Type from "Agency" to "Restaurant".
4. Save.
5. Observe: `companies.business_type` = `restaurant`, but `business_configuration.business_type` still = `agency`.

**Recommended Fix:**
Add a `BEFORE UPDATE` trigger on `public.companies` that propagates `business_type` changes to `business_configuration`:

```sql
CREATE OR REPLACE FUNCTION public.sync_business_type_to_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.business_type IS DISTINCT FROM OLD.business_type THEN
    UPDATE public.business_configuration
    SET business_type = NEW.business_type
    WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_company_business_type_change
  AFTER UPDATE OF business_type ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.sync_business_type_to_config();
```

Alternatively, remove the `business_type` column from `business_configuration` and always JOIN to `companies` to read it.

---

### HIGH-03 — `CompanyRow.business_type`, `currency_code`, `locale` Typed as Optional Despite Being `NOT NULL` in DB

**Affected Module:** Settings, any component reading `CompanyRow`
**File:** `artifacts/crm-dashboard/src/lib/supabase.ts` — lines 42–46

```typescript
business_type?: BusinessType;   // optional — but DB column is NOT NULL
currency_code?: CurrencyCode;   // optional — but DB column is NOT NULL
locale?: SupportedLocale;       // optional — but DB column is NOT NULL
```

**Root Cause:**
The Phase 1 migration adds all three columns as `NOT NULL DEFAULT '...'`. After migration 027 has run, these columns are guaranteed non-null for all rows. The `CompanyRow` interface was written before the migration ran and was conservatively typed as optional. It was never updated to reflect the actual post-migration schema.

**Impact:**
- TypeScript does not enforce correct usage — callers can skip null-checks that are genuinely unnecessary.
- `SettingsPage.tsx` correctly applies `?? 'agency'` fallbacks (lines 208–210) but these are defensive code for a situation that no longer exists, masking any future issue where the column genuinely is null (data corruption).
- Other future components reading `company.business_type` without a null guard will render `undefined` in production.

**Recommended Fix:**
Remove the `?` on all three fields in `CompanyRow`:

```typescript
business_type: BusinessType;
currency_code: CurrencyCode;
locale: SupportedLocale;
```

Similarly, mark `slug` and `plan` as `never` or remove them — the comment on lines 36–39 says they are "not present in the live schema", meaning they should not be in the type at all.

---

### HIGH-04 — TypeScript Errors in `@workspace/api-server` Strict Check

**Affected Module:** API Server
**Files:**
- `artifacts/api-server/src/app.ts` — line 51
- `artifacts/api-server/src/lib/module-registry.ts` — line 117
**Evidence:** `pnpm --filter @workspace/api-server exec tsc --noEmit`

```
src/app.ts(51,5): error TS2322:
  Type '(req: Record<string, unknown>, ...) => void' is not assignable to
  type '(req: IncomingMessage, ...) => void'.
  Index signature for type 'string' is missing in type 'IncomingMessage'.

src/lib/module-registry.ts(117,31): error TS7006:
  Parameter 'def' implicitly has an 'any' type.
```

**Root Cause:**
1. `app.ts` line 51: The raw body parser's `verify` callback is typed with `req: Record<string, unknown>` but Express/Node expects `req: IncomingMessage`. TypeScript correctly rejects the downcast.
2. `module-registry.ts` line 117: The `annotate()` function calls `MODULE_REGISTRY.map((def) => ...)` where `def` gets an implicit `any` type because `lib/db/dist/index.d.ts` has not been built (CRIT-03). The declaration file is missing, so the import resolves to `any`.

**Impact:**
- CI pipeline type-check step fails.
- The `def` implicit-any means all field accesses on module definitions (`def.module_key`, `def.enabled`, etc.) are untyped — TS cannot catch typos or wrong field names.

**Recommended Fix:**
1. For `app.ts`: cast the verify callback correctly:
```typescript
verify: (req: import("http").IncomingMessage & Record<string, unknown>, ...) => void
```
2. For `module-registry.ts`: explicitly annotate `def`:
```typescript
MODULE_REGISTRY.map((def: ModuleDefinition): AvailableModule => { ... })
```
And fix CRIT-03 to restore the `lib/db` declaration file.

---

### HIGH-05 — `onboard_user()` Creates Companies Without Phase 1 Columns Propagating to `business_configuration`

**Affected Module:** Authentication, Company Onboarding
**File:** `supabase/migrations/20240101000009_fix_onboard_user.sql` — lines 138–145

```sql
INSERT INTO public.companies (name)
VALUES (v_company_name)
RETURNING id INTO v_company_id;
```

**Root Cause:**
`onboard_user()` inserts into `companies` with only the `name` column. The Phase 1 defaults (`business_type = 'agency'`, `currency_code = 'INR'`, `locale = 'en-IN'`) apply correctly via `ALTER TABLE ... DEFAULT`. The Phase 2 trigger `on_company_created_init_config` fires AFTER INSERT and seeds `business_configuration` using `COALESCE(NEW.business_type, 'agency')`.

However, new users are always onboarded as "Agency" regardless of their actual business. There is no onboarding step where the user selects their `business_type` before the company row is created. The `business_configuration` is therefore seeded with the wrong module set for the majority of non-agency businesses.

**Impact:**
- A restaurant owner who signs up gets `pipeline: true`, `proposals: true`, `documents: true` enabled by default (agency defaults) instead of the correct restaurant defaults (`pipeline: false`, `proposals: false`).
- The module configuration is wrong from first login until the admin manually visits Settings and changes the business type — and even then, changing the business type does NOT re-seed `enabled_modules` (HIGH-02).

**Recommended Fix:**
Add a business type selection screen to the signup/onboarding flow (displayed once, before or immediately after account creation). Pass the selected type to `onboard_user()` as a parameter and include it in the INSERT:

```sql
CREATE OR REPLACE FUNCTION public.onboard_user(p_business_type TEXT DEFAULT 'agency')
...
INSERT INTO public.companies (name, business_type)
VALUES (v_company_name, p_business_type)
```

---

### HIGH-06 — `super_admin` with `company_id = NULL` Creates Users with `company_id = NULL`

**Affected Module:** User Management, Authentication
**File:** `artifacts/api-server/src/routes/users.ts` — lines 112–122

```typescript
const { error: upsertErr } = await supabase
  .from("user_profiles")
  .upsert({
    id:         newUserId,
    full_name:  name.trim(),
    role:       role as ValidRole,
    company_id: callerProfile.company_id,  // ← null when caller is super_admin
  }, { onConflict: "id" });
```

**Root Cause:**
A `super_admin` who does not belong to any company (i.e., `user_profiles.company_id IS NULL`) can call `POST /api/users`. The endpoint upserts the new user's profile with `company_id` set to the caller's `company_id`, which is `null`. The new user profile ends up with `company_id = NULL`, making them invisible to all company-scoped RLS policies and inaccessible from any company's user list.

**Impact:**
- New users created by a super_admin with no company have no company assignment.
- They cannot see any company-scoped data.
- They cannot be found by other admins via the Users page (RLS filters by `get_my_company_id()`).
- The auth account exists (Supabase Auth) but the profile is effectively orphaned.

**Reproduction Steps:**
1. Authenticate as a `super_admin` user who has `company_id = NULL`.
2. `POST /api/users` with `{ name, email, password, role }`.
3. Check `user_profiles` for the new user — `company_id` is `NULL`.

**Recommended Fix:**
Add a `company_id` field to the request body and require it when the caller is a `super_admin` without a company:

```typescript
if (!callerProfile.company_id && !req.body.company_id) {
  res.status(400).json({ error: "company_id is required when caller has no company." });
  return;
}
const targetCompanyId = callerProfile.company_id ?? req.body.company_id;
```

---

## 🟡 Medium Priority Bugs

---

### MED-01 — Migration 027 `ADD CONSTRAINT` Has No `IF NOT EXISTS` Guard (Will Fail on Re-Run)

**Affected Module:** Database migrations
**File:** `supabase/migrations/20240101000027_universal_business_foundation.sql` — lines 41, 48, 55

```sql
ALTER TABLE public.companies
  ADD CONSTRAINT companies_business_type_check CHECK (...);
```

**Root Cause:**
PostgreSQL `ADD CONSTRAINT` does not support `IF NOT EXISTS`. If this migration is run twice (e.g., in a reset/restore scenario, or if the migration runner does not track state), it raises:
```
ERROR: constraint "companies_business_type_check" for relation "companies" already exists
```

This is a known caveat of raw SQL migrations. The `ADD COLUMN IF NOT EXISTS` clauses on lines 17–32 are idempotent; the `ADD CONSTRAINT` clauses on lines 41–61 are not.

**Impact:** Re-running migrations on an existing database fails entirely, blocking schema resets and test environment rebuilds.

**Recommended Fix:**
Wrap each constraint addition in a DO block:
```sql
DO $$ BEGIN
  ALTER TABLE public.companies ADD CONSTRAINT companies_business_type_check CHECK (...);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

---

### MED-02 — `business_configuration` Backfill Calls `default_business_config()` 5× Per Company

**Affected Module:** Database migrations (Migration 028)
**File:** `supabase/migrations/20240101000028_business_configuration.sql` — lines 422–443

```sql
SELECT
  c.id,
  COALESCE(c.business_type, 'agency'),
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'enabled_modules',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'dashboard_layout',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'feature_flags',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'branding',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'ai_configuration'
FROM public.companies c ...
```

**Root Cause:**
The function is called once per JSONB column (5 times per company row), not once per company. Although the function is marked `IMMUTABLE` and PostgreSQL may cache repeated calls with identical arguments, this is implementation-defined behavior. On a database with many existing companies, this multiplies execution cost by 5.

**Impact:** Migration 028 is slower than necessary on databases with large numbers of existing company rows. No correctness issue.

**Recommended Fix:**
Use a CTE or lateral join to call the function once per row:
```sql
WITH config AS (
  SELECT c.id, COALESCE(c.business_type, 'agency') AS bt,
         public.default_business_config(COALESCE(c.business_type, 'agency')) AS cfg
  FROM public.companies c
  WHERE NOT EXISTS (SELECT 1 FROM public.business_configuration bc WHERE bc.company_id = c.id)
)
INSERT INTO public.business_configuration (company_id, business_type, enabled_modules, ...)
SELECT id, bt, cfg -> 'enabled_modules', ... FROM config
ON CONFLICT (company_id) DO NOTHING;
```

---

### MED-03 — `enabled_modules` Seeds `documents: true` and `support_tickets: true` for Installed=False Modules

**Affected Module:** Business Configuration, Module Registry
**File:** `supabase/migrations/20240101000028_business_configuration.sql` — lines 66–70 (agency seed)

```sql
'enabled_modules', jsonb_build_object(
  ...
  'documents',       true,
  'support_tickets', true,
  'website_projects', true,
  ...
)
```

**Root Cause:**
The `default_business_config()` function seeds `documents: true` and `support_tickets: true` for agency and several other business types. However, in the module registry (Phase 4), both modules are explicitly marked `installed: false`, `production_ready: false`, `hidden: true`. The `getVisibleModules()` function correctly excludes them, but the `business_configuration.enabled_modules` JSONB blob contains stale `true` values for features that don't exist.

**Impact:**
- When `getAvailableModules()` is called without filters, it returns `documents` and `support_tickets` as `is_enabled: true`, which is misleading.
- Any future code that reads `enabled_modules` directly from the DB without going through the registry gating will incorrectly think these modules are active.
- The `SettingsPage` (if it ever renders an enabled_modules toggle UI) will show these modules as "on".

**Recommended Fix:**
Update `default_business_config()` to set `documents: false` and `support_tickets: false` for all business types, matching their `installed: false` state in the registry. Run a one-time UPDATE to fix existing rows:
```sql
UPDATE public.business_configuration
SET enabled_modules = enabled_modules
  || '{"documents": false, "support_tickets": false}'::jsonb;
```

---

### MED-04 — `SettingsPage.tsx` Fetches `slug` and `plan` Columns That Don't Exist

**Affected Module:** Settings
**File:** `artifacts/crm-dashboard/src/pages/SettingsPage.tsx` — line 195

```typescript
.select('id, name, slug, plan, address, business_type, currency_code, locale')
```

**Root Cause:**
The `CompanyRow` interface comments on `supabase.ts` lines 36–38 explicitly note: _"slug, plan, updated_at are not present in the live schema"_. Despite this, `SettingsPage.tsx` requests them in the SELECT. Supabase PostgREST returns `null` for columns that exist but are null, and throws a 400 error for columns that don't exist at all. If `slug` and `plan` truly don't exist on the table, this query fails.

**Impact:**
- If columns do not exist: `SettingsPage` throws a 400 and the company information section renders blank.
- If columns do exist but are null: data loads correctly but wastes bandwidth fetching null fields.

**Recommended Fix:**
Remove `slug, plan` from the SELECT string and from `CompanyRow`. Confirm their schema status by checking the live migration history.

---

### MED-05 — `client_portal` Route Is Accessible to All Authenticated Users Including `employee` Role

**Affected Module:** Client Portal, Authorization
**File:** `artifacts/crm-dashboard/src/App.tsx` — line 84

```typescript
<Route path="/client-portal" element={<ClientPortal />} />
// ↑ Outside the <ProtectedRoute adminOnly> block — no role restriction
```

**Root Cause:**
`/client-portal` is placed inside the outer `<ProtectedRoute>` (authentication required) but outside the `<ProtectedRoute adminOnly>` block (lines 74–82). The module registry correctly lists `required_permissions: ["super_admin", "company_admin", "manager", "employee"]`, so all authenticated users can access it. However, inside `ClientPortal.tsx`:

```typescript
const canManage = isAdmin || profile?.role === 'manager';
```

The page has internal role-gating for management actions, but a `telecaller` or `employee` can still land on the page and see client data. Depending on business requirements, client portal access may need to be manager+ only.

**Impact:**
Employees can view the client portal, see all client projects, documents, and portal links. This may be intentional (the registry marks it `employee`-accessible) but warrants explicit confirmation.

**Recommended Fix:**
Confirm with product stakeholders whether `employee` role should have client portal read access. If not, move the route inside a `<ProtectedRoute requiredRoles={['super_admin','company_admin','manager']} />` block.

---

### MED-06 — `AuthContext.tsx` Profile Fetch Failure Silently Leaves User in Broken State

**Affected Module:** Authentication, All modules
**File:** `artifacts/crm-dashboard/src/contexts/AuthContext.tsx`

**Root Cause:**
When `runOnboarding()` fails (Supabase unreachable, RPC error, etc.), `profile` is set to `null` and `loading` is set to `false`. The app then renders as if the user is unauthenticated. There is no retry mechanism, no error message, and no differentiation between "not logged in" and "logged in but profile load failed". A user in this state sees the login page again even though they have a valid session.

**Impact:**
Users with valid auth sessions who experience a transient network hiccup during onboarding are silently redirected to login. Re-logging in triggers the same onboarding RPC — if the database is the source of failure, this loop repeats indefinitely.

**Recommended Fix:**
Distinguish between "no session" and "session exists but profile failed to load". For the latter, render a dedicated error state with a "Retry" button that calls `runOnboarding()` again, and surface the error message so users can report it.

---

### MED-07 — No `UPDATE` for `business_configuration.business_type` in `SettingsPage` Update Path

**Affected Module:** Settings, Business Configuration
**File:** `artifacts/crm-dashboard/src/pages/SettingsPage.tsx` — lines 244–254

```typescript
await supabase.from('companies').update({
  ...
  business_type: companyForm.business_type,
  ...
}).eq('id', profile.company_id!);
// ↑ Does NOT update business_configuration.business_type
```

**Root Cause:**
This is the client-side manifestation of HIGH-02. The SettingsPage correctly UPDATEs `companies.business_type` but there is no corresponding UPDATE to `business_configuration.business_type`. The server trigger only fires on INSERT, not UPDATE.

**Impact:** Same as HIGH-02 — module gating uses stale business type after settings change.

**Recommended Fix:** Addressed by HIGH-02's trigger recommendation, OR add a second Supabase call in `handleSaveCompany()`:

```typescript
await supabase.from('business_configuration').update({
  business_type: companyForm.business_type,
}).eq('company_id', profile.company_id!);
```

---

## 🟢 Low Priority Bugs

---

### LOW-01 — Email Validation in `POST /api/users` Is Too Permissive

**Affected Module:** User Management
**File:** `artifacts/api-server/src/routes/users.ts` — lines 73–79

```typescript
if (!email || typeof email !== "string" || !email.trim().includes("@")) {
  res.status(400).json({ error: "A valid email address is required." });
}
```

**Root Cause:**
The check only verifies the string contains `@`. Values like `@`, `a@`, `@b`, `a@b`, or SQL-injection strings that include `@` all pass validation.

**Impact:** Malformed email addresses can be registered. Supabase Auth will attempt to create users with invalid emails, which may succeed (Supabase validates format independently) or return a confusing upstream error.

**Recommended Fix:**
Use a regex or a library: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)`.

---

### LOW-02 — `social_media` Module Has No "Beta" Badge in the Sidebar

**Affected Module:** Social Media, Sidebar Navigation
**Files:**
- `lib/db/src/schema/module-registry.ts` — `social_media` entry: `beta: true, production_ready: false`
- `artifacts/crm-dashboard/src/components/layout/DashboardLayout.tsx` — sidebar nav items

**Root Cause:**
The `social_media` module is correctly flagged `beta: true` and `production_ready: false` in the registry. However, `DashboardLayout.tsx` still includes the Social Media link in the sidebar (it uses a hardcoded `mainNavItems` array, not the module registry). There is no "Beta" badge, warning tooltip, or visual indicator that this module is not production-ready.

**Impact:** Users navigate to Social Media expecting full functionality; the feature is in early-stage development.

**Recommended Fix:** Once the sidebar is wired to the module registry (planned future phase), the `beta` flag will naturally drive badge rendering. Until then, manually add a `<span className="badge">Beta</span>` next to the Social Media nav item.

---

### LOW-03 — `default_business_config()` Marked `IMMUTABLE` When It Uses `CASE`

**Affected Module:** Database migrations
**File:** `supabase/migrations/20240101000028_business_configuration.sql` — line 57

```sql
CREATE OR REPLACE FUNCTION public.default_business_config(p_business_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
```

**Root Cause:**
PostgreSQL `IMMUTABLE` means the function returns the same value for identical inputs with no side effects and no I/O — which is correct here. However, `plpgsql` functions are generally recommended as `STABLE` or `VOLATILE` by convention. `IMMUTABLE plpgsql` is valid but restricts inlining and may emit a warning from some linters. The function is pure (only CASE on the input), so IMMUTABLE is technically correct, but STABLE would be the conventional choice.

**Impact:** No runtime correctness issue. Potential lint warnings. Minor documentation confusion.

**Recommended Fix:** Change to `STABLE` to follow PostgreSQL conventions for plpgsql functions.

---

### LOW-04 — `supabase.ts` LeadRow Uses `number` Type for Unix Timestamps (`added_at`, `last_activity_at`)

**Affected Module:** Leads, All modules using LeadRow
**File:** `artifacts/crm-dashboard/src/lib/supabase.ts` — lines 136–147 and `artifacts/api-server/src/lib/supabase.ts` — lines 30–40

```typescript
added_at:         number;
last_activity_at: number;
```

**Root Cause:**
These fields are stored as `BIGINT` (Unix milliseconds) in Postgres and arrive as numbers from PostgREST. The type is correct, but there is no documentation of the unit (milliseconds vs seconds). Consumers in `LeadsPage.tsx` and `Dashboard.tsx` must know the unit to format dates correctly. This is a documentation and future-maintenance risk.

**Recommended Fix:** Add JSDoc comments: `/** Unix timestamp in milliseconds */`. Consider a branded type: `type UnixMs = number & { readonly _brand: 'UnixMs' }`.

---

### LOW-05 — `set_updated_at()` Silently Swallows ALL Exceptions (Not Just Missing Column)

**Affected Module:** Database triggers, all tables with set_updated_at trigger
**File:** `supabase/migrations/20240101000009_fix_onboard_user.sql` — lines 22–34

```sql
BEGIN
  NEW.updated_at = now();
EXCEPTION WHEN others THEN
  NULL; -- swallows everything, including permission errors, disk full, etc.
END;
```

**Root Cause:**
The fix correctly handles the "column does not exist" case. However, `WHEN others` is a catch-all that also swallows disk-full errors, permission errors, and other catastrophic conditions. If `updated_at` fails to set for any reason other than the column not existing, the failure is silently discarded.

**Impact:** Low probability but high impact if triggered — timestamp updates fail silently, leading to stale `updated_at` values that are invisible to the developer.

**Recommended Fix:**
Catch only the specific error:
```sql
EXCEPTION WHEN undefined_column THEN NULL;
```
Use `SQLSTATE '42703'` if the named exception isn't available in the installed PG version.

---

## 🎨 UI Issues

---

### UI-01 — Blank White Screen on Missing Supabase Secrets (No Error UI)

**Affected Module:** All (startup failure)
**File:** `artifacts/crm-dashboard/src/lib/supabase.ts` — line 21; `artifacts/crm-dashboard/src/main.tsx`

No error boundary wraps the app root. When `createClient` throws during module evaluation, the entire React tree fails to mount. The user sees a blank white screen with no message.

**Recommended Fix:** Add a top-level React error boundary in `main.tsx` that renders a `<SetupErrorPage>` with instructions to add Replit Secrets.

---

### UI-02 — `social_media` Appears in Sidebar With No Beta Indicator

**Affected Module:** Social Media, Sidebar
**File:** `artifacts/crm-dashboard/src/components/layout/DashboardLayout.tsx`

Social Media is listed in the sidebar alongside production-ready modules with no visual distinction. Users expect the same quality level as Leads, Pipeline, etc.

**Recommended Fix:** Add a "Beta" badge chip on the nav item. Optionally show a tooltip: "This module is in early access and may have limited functionality."

---

### UI-03 — Settings Page Shows No Feedback When `slug`/`plan` Columns Are Absent

**Affected Module:** Settings
**File:** `artifacts/crm-dashboard/src/pages/SettingsPage.tsx` — lines 195–211

If PostgREST returns an error because `slug` or `plan` don't exist in the schema, `handleSaveCompany` catches the error and shows a generic toast: "Failed to load company information". The user sees no actionable information.

**Recommended Fix:** Remove non-existent columns from the SELECT (MED-04) so the query never fails for this reason.

---

### UI-04 — All New Companies Onboarded as "Agency / INR / en-IN" With No User Choice

**Affected Module:** Company Onboarding
**File:** `supabase/migrations/20240101000009_fix_onboard_user.sql` — lines 138–145

New users who sign up get a company silently created with `business_type = 'agency'`. The first screen they land on is the Dashboard — there is no welcome wizard or business type prompt. The Settings page is deep in an admin-only route.

**Impact:** Poor first-run experience. The dashboard may show modules irrelevant to the user's actual business type until they discover Settings.

**Recommended Fix:** Add a one-time "Welcome" modal on first login that prompts for business type. Optionally redirect new users directly to `/settings` after onboarding.

---

## ⚡ Performance Issues

---

### PERF-01 — WhatsApp Queue Processor: No Back-Off, No Circuit Breaker

**Affected Module:** WhatsApp
**File:** `artifacts/api-server/src/lib/whatsapp-queue-processor.ts` — lines 357–383

The queue processor fires unconditionally every 2,000 ms. When credentials are misconfigured (CRIT-01, CRIT-02), it makes 30 failed network calls per minute with no rate reduction. This wastes CPU, network I/O, and log storage at a constant rate.

**Recommended Fix:** Implement exponential back-off: double the tick interval on each consecutive failure (2 s → 4 s → 8 s → … → 64 s max). Reset to 2 s on the first successful tick.

---

### PERF-02 — `default_business_config()` Called 5× Per Company in Backfill Query

**Affected Module:** Database migrations (Migration 028 — one-time cost)
**File:** `supabase/migrations/20240101000028_business_configuration.sql` — lines 433–438

Already documented in MED-02. Repeated here as a performance finding. For a tenant database with 1,000 company rows, the migration executes the function 5,000 times instead of 1,000. Although `IMMUTABLE` allows caching, worst-case this is a 5× slowdown during backfill.

---

### PERF-03 — `SettingsPage.tsx` Fetches Company Data on Every Mount With No Caching

**Affected Module:** Settings
**File:** `artifacts/crm-dashboard/src/pages/SettingsPage.tsx` — lines 188–220

`fetchData()` is called inside a `useEffect` with no dependency array guard other than `profile?.company_id`. Every time the Settings page is mounted (navigating away and back), the full company fetch re-runs. The data is not cached in any context or store.

**Impact:** Repeated network round-trips on a page the admin visits frequently. On slow connections this causes a visible loading flash on every visit.

**Recommended Fix:** Cache company data in `AuthContext` alongside `profile`, or use React Query / SWR for automatic stale-while-revalidate caching.

---

## 🔒 Security Issues

---

### SEC-01 — API Server Shares `VITE_SUPABASE_URL` Secret Name With Frontend Bundle

**Affected Module:** API Server, Secret Management
**File:** `artifacts/api-server/src/lib/supabase.ts` — line 47

`VITE_` prefix variables are statically inlined into the Vite frontend bundle at build time. If the backend ever imports a Vite-built artifact, or if secrets management tooling automatically injects all `VITE_` vars into environment scripts, there is a risk that `SUPABASE_SERVICE_ROLE_KEY` gets associated with a `VITE_`-namespaced URL in build outputs. The key itself is not exposed, but the coupling is a maintenance hazard.

**Recommended Fix:** Use a separate `SUPABASE_URL` (no `VITE_` prefix) for the server, even if it points to the same host as `VITE_SUPABASE_URL`. Keep server-side secrets clearly separated from client-side environment variables.

---

### SEC-02 — `POST /api/users` Creates Service-Role Auth Users With No Rate Limiting

**Affected Module:** User Management
**File:** `artifacts/api-server/src/routes/users.ts`

The endpoint uses `supabase.auth.admin.createUser()` (service-role, bypasses Supabase Auth rate limits). There is no application-level rate limiting on this route. A `company_admin` with a valid token could create thousands of auth accounts in rapid succession.

**Impact:** Auth system abuse, inflated Supabase MAU counts, potential cost escalation on Supabase paid plans.

**Recommended Fix:** Add rate limiting middleware (e.g., `express-rate-limit`) scoped to the caller's user ID: max 10 user creations per hour per company.

---

### SEC-03 — `business_configuration` RLS Grants `EXECUTE` on `create_default_business_configuration()` to `authenticated`

**Affected Module:** Database RLS
**File:** `supabase/migrations/20240101000028_business_configuration.sql` — line 474

```sql
GRANT EXECUTE ON FUNCTION public.create_default_business_configuration() TO authenticated;
```

**Root Cause:**
`create_default_business_configuration()` is a trigger function — it is only called internally by PostgreSQL when a row is inserted into `companies`. Regular users have no reason to call it directly. Granting `EXECUTE` to `authenticated` allows any logged-in user to invoke `SELECT public.create_default_business_configuration()` directly via PostgREST's RPC endpoint.

**Impact:**
- A malicious authenticated user can call the function directly and attempt to insert a `business_configuration` row for a `company_id` of their choosing.
- The function uses `SECURITY DEFINER` and `ON CONFLICT DO NOTHING`, so a direct call with a valid `company_id` they already own would harmlessly no-op. However, if they supply another company's ID, the `SECURITY DEFINER` context would allow the INSERT before the `company_id` FK check rejects it (assuming `company_id` exists in `companies`). This is an information-leak vector for valid company UUIDs.

**Recommended Fix:**
Remove the `EXECUTE` grant for `authenticated`. Trigger functions should only be called by the trigger mechanism itself:

```sql
REVOKE EXECUTE ON FUNCTION public.create_default_business_configuration() FROM authenticated;
```

---

## Appendix A — Test Coverage Matrix

| Module | Auth Gate Verified | CRUD Verified | RLS Policy | API Endpoint | Build |
|---|---|---|---|---|---|
| Authentication / Signup | ❌ App won't load (CRIT-01) | — | ✅ | — | — |
| Dashboard | ❌ App won't load | — | — | — | — |
| Leads | ❌ App won't load | — | ✅ (migration 001) | — | ✅ |
| Pipeline | ❌ App won't load | — | ✅ | — | ✅ |
| Tasks | ❌ App won't load | — | ✅ | — | ✅ |
| Calls / Telecaller | ❌ App won't load | — | ✅ | — | ✅ |
| WhatsApp | ❌ App won't load | — | ✅ | ⚠️ Queue fails (CRIT-02) | ✅ |
| Proposals | ❌ App won't load | — | ✅ | — | ✅ |
| Invoices | ❌ App won't load | — | ✅ | — | ✅ |
| HR | ❌ App won't load | — | ✅ | — | ✅ |
| Website Projects | ❌ App won't load | — | ✅ | — | ✅ |
| Client Portal | ❌ App won't load | — | ✅ | — | ✅ |
| Analytics | ❌ App won't load | — | ✅ | — | ✅ |
| Settings | ❌ App won't load | — | ✅ | — | ✅ |
| User Management | — | — | ✅ | ⚠️ (HIGH-06) | ✅ |
| Business Configuration | — | — | ✅ (SEC-03 caveat) | — | ✅ |
| Module Registry | — | — | N/A | — | ✅ |

> **CRUD and live module tests could not be performed** because CRIT-01 (missing Supabase secrets) prevents the frontend from loading. All module-level testing is blocked pending resolution of CRIT-01.

---

## Appendix B — Build Summary

| Package | esbuild / Vite Production | TypeScript Strict (`tsc --noEmit`) |
|---|---|---|
| `@workspace/crm-dashboard` | ✅ Pass (9.86 s) | ✅ Pass |
| `@workspace/api-server` | ✅ Pass (0.51 s) | ❌ 5 errors (CRIT-03, HIGH-04) |
| `@workspace/db` | N/A (type-only) | ❌ 10+ errors (CRIT-03) |

---

## Appendix C — Recommended Resolution Order

1. **CRIT-01** — Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` secrets and add proper error boundary. Unblocks all module testing.
2. **CRIT-02 + HIGH-01** — Add server-side `SUPABASE_URL` secret + fix queue processor back-off. Stops log flooding.
3. **CRIT-03** — Resolve Zod v4 / Drizzle incompatibility. Restores CI type-check.
4. **HIGH-02 + MED-07** — Add business_type sync trigger. Prevents silent module-config drift.
5. **HIGH-03** — Make `CompanyRow.business_type`, `currency_code`, `locale` non-optional.
6. **HIGH-04** — Fix TypeScript errors in `app.ts` and `module-registry.ts`.
7. **HIGH-05** — Add business type selection to onboarding flow.
8. **HIGH-06** — Guard `company_id = null` in user creation route.
9. **SEC-03** — Revoke EXECUTE grant on trigger function.
10. **MED-01 through MED-07** — Address in order of migration stability first (MED-01, MED-02), then data consistency (MED-03), then UI correctness (MED-04, MED-05, MED-06, MED-07).
