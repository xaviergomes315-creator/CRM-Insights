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
  // ── Universal Business Foundation (Phase 1) ──────────────────
  // These columns are NOT NULL with DB-level defaults (migration 027).
  // All rows are guaranteed to have a non-null value after migration.
  /** Kind of business — drives module defaults and UI labels. */
  business_type: BusinessType;
  /** ISO 4217 currency code used for proposals, invoices, and AI prompts. */
  currency_code: CurrencyCode;
  /** BCP-47 locale tag used for number/date formatting and AI prompt localisation. */
  locale: SupportedLocale;
}

// ─── Universal Business Foundation types ──────────────────────────────────────

export type BusinessType =
  | 'agency'
  | 'restaurant'
  | 'gym'
  | 'clinic'
  | 'retail'
  | 'real_estate'
  | 'manufacturing'
  | 'education'
  | 'finance'
  | 'hospitality'
  | 'other';

export type CurrencyCode =
  | 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD'
  | 'AUD' | 'CAD' | 'JPY' | 'CNY' | 'MYR' | 'THB' | 'ZAR';

export type SupportedLocale =
  | 'en-IN' | 'en-US' | 'en-GB' | 'en-AU' | 'en-AE'
  | 'en-SG' | 'en-MY' | 'en-ZA' | 'zh-CN' | 'ja-JP'
  | 'de-DE' | 'fr-FR' | 'ar-AE' | 'th-TH';

/** Human-readable labels for each business type. */
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  agency:        'Digital / Creative Agency',
  restaurant:    'Restaurant & Food Service',
  gym:           'Gym & Fitness',
  clinic:        'Clinic & Healthcare',
  retail:        'Retail & E-Commerce',
  real_estate:   'Real Estate',
  manufacturing: 'Manufacturing',
  education:     'Education & Training',
  finance:       'Finance & Accounting',
  hospitality:   'Hospitality & Travel',
  other:         'Other',
};

/** Human-readable labels for each currency code. */
export const CURRENCY_CODE_LABELS: Record<CurrencyCode, string> = {
  INR: 'INR — Indian Rupee (₹)',
  USD: 'USD — US Dollar ($)',
  EUR: 'EUR — Euro (€)',
  GBP: 'GBP — British Pound (£)',
  AED: 'AED — UAE Dirham (د.إ)',
  SGD: 'SGD — Singapore Dollar (S$)',
  AUD: 'AUD — Australian Dollar (A$)',
  CAD: 'CAD — Canadian Dollar (C$)',
  JPY: 'JPY — Japanese Yen (¥)',
  CNY: 'CNY — Chinese Yuan (¥)',
  MYR: 'MYR — Malaysian Ringgit (RM)',
  THB: 'THB — Thai Baht (฿)',
  ZAR: 'ZAR — South African Rand (R)',
};

/** Human-readable labels for each locale. */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'en-IN': 'English (India)',
  'en-US': 'English (United States)',
  'en-GB': 'English (United Kingdom)',
  'en-AU': 'English (Australia)',
  'en-AE': 'English (UAE)',
  'en-SG': 'English (Singapore)',
  'en-MY': 'English (Malaysia)',
  'en-ZA': 'English (South Africa)',
  'zh-CN': 'Chinese Simplified (China)',
  'ja-JP': 'Japanese (Japan)',
  'de-DE': 'German (Germany)',
  'fr-FR': 'French (France)',
  'ar-AE': 'Arabic (UAE)',
  'th-TH': 'Thai (Thailand)',
};

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
