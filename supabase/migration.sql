-- ============================================================
--  CRM Pro — Supabase Migration
--  Run this once in the Supabase SQL Editor (or via CLI).
-- ============================================================

-- ── Leads ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT        NOT NULL,
  email            TEXT        NOT NULL DEFAULT '',
  phone            TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'New',
  source           TEXT        NOT NULL,
  assigned_to      TEXT        NOT NULL DEFAULT '',
  added_at         BIGINT      NOT NULL,
  last_activity_at BIGINT      NOT NULL,

  CONSTRAINT leads_status_check
    CHECK (status IN ('New','Interested','Demo Scheduled','Closed')),

  CONSTRAINT leads_source_check
    CHECK (source IN ('WhatsApp','Website','IndiaMart','JustDial','Social Media'))
);

-- ── Tasks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id             BIGSERIAL PRIMARY KEY,
  lead_id        BIGINT      NOT NULL,
  lead_name      TEXT        NOT NULL,
  lead_phone     TEXT        NOT NULL DEFAULT '',
  follow_up_date TEXT        NOT NULL,   -- YYYY-MM-DD
  follow_up_time TEXT        NOT NULL DEFAULT '',  -- HH:MM
  note           TEXT        NOT NULL DEFAULT '',
  done           BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ── Row Level Security — disable for anon key access ─────────
-- (The app manages auth entirely through mock credentials in
--  AuthContext, so we disable RLS and allow all operations via
--  the anon key.  Re-enable and add policies if you switch to
--  Supabase Auth later.)

ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;

-- Optional: grant anon role full CRUD
GRANT ALL ON public.leads TO anon, authenticated, service_role;
GRANT ALL ON public.tasks TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.leads_id_seq TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tasks_id_seq TO anon, authenticated, service_role;
