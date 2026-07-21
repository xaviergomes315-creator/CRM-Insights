import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Allowed-value constants (mirror migration 027 CHECK constraints) ──────────

export const BUSINESS_TYPES = [
  "agency",
  "restaurant",
  "gym",
  "clinic",
  "retail",
  "real_estate",
  "manufacturing",
  "education",
  "finance",
  "hospitality",
  "other",
] as const;

export const CURRENCY_CODES = [
  "INR", "USD", "EUR", "GBP", "AED", "SGD",
  "AUD", "CAD", "JPY", "CNY", "MYR", "THB", "ZAR",
] as const;

export const SUPPORTED_LOCALES = [
  "en-IN", "en-US", "en-GB", "en-AU", "en-AE",
  "en-SG", "en-MY", "en-ZA", "zh-CN", "ja-JP",
  "de-DE", "fr-FR", "ar-AE", "th-TH",
] as const;

export type BusinessType    = (typeof BUSINESS_TYPES)[number];
export type CurrencyCode    = (typeof CURRENCY_CODES)[number];
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// ─── Drizzle table definition ─────────────────────────────────────────────────

/**
 * public.companies
 *
 * Schema matches the live Postgres table after all migrations, including:
 *   • 20240101000001_multi_tenant_rls   (core columns)
 *   • 20240101000017_company_branding   (email, phone, website, logo_url)
 *   • 20240101000026_companies_gst_number (gst_number)
 *   • 20240101000027_universal_business_foundation (business_type, currency_code, locale)
 *
 * All three Phase-1 columns are NOT NULL with DB-level defaults so that:
 *   • Existing rows are backfilled automatically by the migration.
 *   • New companies created by onboard_user() receive the defaults without
 *     any change to the SQL function.
 */
export const companiesTable = pgTable("companies", {
  id:            uuid("id").primaryKey().defaultRandom(),
  name:          text("name").notNull(),
  slug:          text("slug").unique(),
  plan:          text("plan").notNull().default("free"),

  // Address & contact
  address:       text("address"),
  gst_number:    text("gst_number"),

  // Branding (migration 017)
  email:         text("email"),
  phone:         text("phone"),
  website:       text("website"),
  logo_url:      text("logo_url"),

  // ── Universal Business Foundation — Phase 1 (migration 027) ──────────────
  /** Kind of business — drives module defaults and UI labels. Default: 'agency'. */
  business_type: text("business_type").notNull().default("agency"),
  /** ISO 4217 currency code used for proposals, invoices, and AI prompts. Default: 'INR'. */
  currency_code: text("currency_code").notNull().default("INR"),
  /** BCP-47 locale tag used for number/date formatting and AI prompt localisation. Default: 'en-IN'. */
  locale:        text("locale").notNull().default("en-IN"),

  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Zod schemas derived from the table ──────────────────────────────────────

export const insertCompanySchema = createInsertSchema(companiesTable, {
  business_type: z.enum(BUSINESS_TYPES).default("agency"),
  currency_code: z.enum(CURRENCY_CODES).default("INR"),
  locale:        z.enum(SUPPORTED_LOCALES).default("en-IN"),
  plan:          z.enum(["free", "starter", "pro", "enterprise"]).default("free"),
}).omit({ id: true, created_at: true, updated_at: true });

export const selectCompanySchema = createSelectSchema(companiesTable, {
  business_type: z.enum(BUSINESS_TYPES),
  currency_code: z.enum(CURRENCY_CODES),
  locale:        z.enum(SUPPORTED_LOCALES),
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company       = z.infer<typeof selectCompanySchema>;
