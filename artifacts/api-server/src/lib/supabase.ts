/**
 * Supabase server-side client — uses the service-role key so it bypasses RLS.
 * Only imported server-side (Node / Express). Never expose to the browser.
 *
 * Lazy-initialised so a missing env var logs a warning instead of crashing
 * the process at module load time.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── WebSocket polyfill ────────────────────────────────────────────────────────
// Node.js 20 has no global WebSocket; Node.js 22 adds it natively.
// Without a global WebSocket the Supabase client constructor throws before
// the server can handle any request.  We inject a minimal no-op stub so
// construction succeeds; realtime subscriptions will silently fail (which is
// fine — the server-side client only uses PostgREST REST queries).
if (typeof globalThis.WebSocket === "undefined") {
  class _NoopWS {
    static CONNECTING = 0; static OPEN = 1;
    static CLOSING  = 2; static CLOSED  = 3;
    readyState = 3;          // CLOSED — never actually connects
    addEventListener()  { /* noop */ }
    removeEventListener() { /* noop */ }
    dispatchEvent()     { return false; }
    close()             { /* noop */ }
    send()              { /* noop */ }
  }
  (globalThis as unknown as Record<string, unknown>).WebSocket = _NoopWS;
}

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

  // Prefer the server-side SUPABASE_URL; fall back to the Vite-prefixed name
  // for backwards compatibility with environments that only set VITE_SUPABASE_URL.
  const url = (
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? ""
  ).trim();
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() ?? "";

  if (!url || !key) {
    console.warn(
      "[Supabase] SUPABASE_URL (or VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY is missing. " +
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
    // Using 'any' type here to bypass strict TS overlaps check for Vercel deployment
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
