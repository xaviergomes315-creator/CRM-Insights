/**
 * Supabase browser client — uses the public anon key.
 * RLS is enforced on all tables via the policies in:
 *   supabase/migrations/20240101000001_multi_tenant_rls.sql
 */
import { createClient } from "@supabase/supabase-js";

// Defined here (DB-level concept) to avoid circular imports with AuthContext.
export type UserRole = "super_admin" | "company_admin" | "manager" | "employee";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.error(
    "[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. " +
      "Add them as Replit Secrets and restart the dev server.",
  );
}

export const supabase = createClient(url ?? "", key ?? "");

// ─── Row types (snake_case as stored in Postgres) ─────────────────────────────

/** public.companies */
export interface CompanyRow {
  id: string;          // uuid
  name: string;
  gst_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;  // timestamptz
  // slug, plan, updated_at are not present in the live schema
  slug?: string;
  plan?: "free" | "starter" | "pro" | "enterprise";
  updated_at?: string;
}

/** public.user_profiles */
export interface UserProfileRow {
  id: string;          // uuid — references auth.users(id)
  company_id: string | null;
  full_name: string;
  role: UserRole;
  created_at: string;
  // avatar_url and updated_at are not present in the live schema
  avatar_url?: string | null;
  updated_at?: string;
}

/** public.leads */
export interface LeadRow {
  id:               number;
  company_id:       string | null;   // uuid
  name:             string;
  email:            string;
  phone:            string;
  status:           string;
  source:           string;
  assigned_to:      string;
  added_at:         number;
  last_activity_at: number;
}

/** public.proposals */
export type ProposalStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired';

export interface ProposalRow {
  id:              string;
  company_id:      string;
  lead_id:         number | null;
  proposal_number: string;
  client_name:     string;
  client_email:    string;
  client_phone:    string;
  status:          ProposalStatus;
  subtotal:        number;
  tax:             number;
  total:           number;
  notes:           string;
  validity_date:   string | null;
  expiry_date:     string | null;
  metadata:        Record<string, unknown>;
  created_by:      string;
  created_at:      string;
  updated_at:      string;
}

/** public.proposal_items */
export interface ProposalItemRow {
  id:          string;
  proposal_id: string;
  service_name: string;
  description: string;
  quantity:    number;
  unit_price:  number;
  discount:    number;
  tax_rate:    number;
  total:       number;
  sort_order:  number;
  metadata:    Record<string, unknown>;
  created_at:  string;
  updated_at:  string;
}

/** public.tasks */
export interface TaskRow {
  id:             number;
  company_id:     string | null;   // uuid
  lead_id:        number;
  lead_name:      string;
  lead_phone:     string;
  follow_up_date: string;
  follow_up_time: string;
  note:           string;
  done:           boolean;
}
