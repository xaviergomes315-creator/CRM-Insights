---
name: Supabase server-side client + Node.js 20 WebSocket
description: Why the Supabase client constructor throws on Node.js 20 and how to fix it without upgrading Node or installing ws.
---

## Rule
Before calling `createClient()` in server-side code on Node.js 20, inject a no-op WebSocket stub into `globalThis` if none is present.

## Why
`@supabase/supabase-js` v2 initialises its realtime (`RealtimeClient`) in the `SupabaseClient` constructor. `RealtimeClient._initializeOptions` calls `getWebSocketConstructor()` which throws `"Node.js detected but native WebSocket not found."` when `globalThis.WebSocket` is undefined (Node.js 20 ships without one; Node.js 22 adds it globally).

The throw propagates out of `createClient()`, so `_client` is never assigned. Every subsequent call to the Proxy's `get` trap re-calls `getClient()` which re-throws — breaking every `supabase.from()` call server-side.

## Fix (no new packages required)
Add this block **before** the first `createClient()` call in `artifacts/api-server/src/lib/supabase.ts`:

```typescript
if (typeof globalThis.WebSocket === "undefined") {
  class _NoopWS {
    static CONNECTING = 0; static OPEN = 1;
    static CLOSING  = 2; static CLOSED  = 3;
    readyState = 3;
    addEventListener()    { /* noop */ }
    removeEventListener() { /* noop */ }
    dispatchEvent()       { return false; }
    close()               { /* noop */ }
    send()                { /* noop */ }
  }
  (globalThis as unknown as Record<string, unknown>).WebSocket = _NoopWS;
}
```

The stub lets the constructor complete. Realtime subscriptions silently fail (fine for server-side REST-only usage). Regular `supabase.from()` PostgREST queries work normally.

## How to apply
Any time a new server-side route (or lib file) uses `supabase` — confirm the polyfill is already at the top of `artifacts/api-server/src/lib/supabase.ts`. It only needs to be there once (module-level side effect). Also wrap Supabase query blocks in try-catch so any future initialisation failure never crashes a route handler.
