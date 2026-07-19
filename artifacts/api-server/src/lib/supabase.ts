/**
 * Supabase server-side client — uses the service-role key so it bypasses RLS.
 * Only imported server-side (Node / Express). Never expose to the browser.
 *
 * Lazy-initialised so a missing env var logs a warning instead of crashing
 * the process at module load time.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface LeadRow {
  id?:              number;
  name:             string;
  email:            string;
  phone:            string;
  status:           string;
  source:           string;
  assigned_to:      string;
  added_at:         number;
  last_activity_at: number;
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env["VITE_SUPABASE_URL"]?.trim() ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() ?? "";

  if (!url || !key) {
    console.warn(
      "[Supabase] VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. " +
        "Webhook lead inserts will NOT persist to the database.",
    );
    // Return a dummy client pointing at a placeholder — operations will fail
    // gracefully with a Supabase error rather than crashing the server.
    _client = createClient("https://placeholder.supabase.co", "placeholder", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return _client;
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _client;
}

// Export a Proxy so call sites use `supabase.from(...)` as usual but the real
// client is only constructed on first actual use.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
  const client = getClient();
  const value = (client as unknown as Record<string | symbol, unknown>)[prop];
  return typeof value === "function" ? value.bind(client) : value;
},
});
