/**
 * Supabase browser client — uses the public anon key.
 * RLS is disabled on leads/tasks tables so the anon key has full CRUD access.
 */
import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.error(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
    'Add them as Replit Secrets and restart the dev server.',
  );
}

export const supabase = createClient(url ?? '', key ?? '');

// ─── Row types (snake_case as stored in Postgres) ─────────────────────────────

export interface LeadRow {
  id:               number;
  name:             string;
  email:            string;
  phone:            string;
  status:           string;
  source:           string;
  assigned_to:      string;
  added_at:         number;
  last_activity_at: number;
}

export interface TaskRow {
  id:             number;
  lead_id:        number;
  lead_name:      string;
  lead_phone:     string;
  follow_up_date: string;
  follow_up_time: string;
  note:           string;
  done:           boolean;
}
