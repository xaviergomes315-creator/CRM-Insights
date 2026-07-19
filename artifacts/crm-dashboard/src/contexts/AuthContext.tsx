import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/supabase";

// Re-export so consumers can import UserRole from either location.
export type { UserRole };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  company_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Convenience alias used by pages that need a flat user+profile shape */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company_id: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  /** true when a Supabase session exists */
  isAuthenticated: boolean;
  /** true for super_admin and company_admin roles */
  isAdmin: boolean;
  /** true for employee role (maps to the old "Telecaller" role) */
  isTelecaller: boolean;
  signOut: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Masks a phone number: shows the first 2 and last 4 characters, hides the rest.
 * e.g. "9876543210" → "98****3210"
 */
export function maskPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 6) return phone; // too short to meaningfully mask
  const head   = digits.slice(0, 2);
  const tail   = digits.slice(-4);
  const middle = "*".repeat(digits.length - 6);
  return head + middle + tail;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Profile fetch constants ──────────────────────────────────────────────────

/**
 * How many times to retry a missing profile before falling back to auto-create.
 * Handles the race between the DB trigger writing the profile and the client
 * fetching it immediately after sign-up / email confirmation.
 */
const PROFILE_RETRY_LIMIT    = 5;
const PROFILE_RETRY_DELAY_MS = 800;

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Guard against setState after unmount
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── Auto-create fallback profile ─────────────────────────────────────────
  /**
   * Called when fetchProfile exhausts all retries without finding a row.
   * Invokes the SECURITY DEFINER RPC `ensure_own_profile` which upserts the
   * profile and returns it — bypassing RLS so the INSERT always succeeds.
   * Clears isLoading when finished (success or failure).
   */
  const createFallbackProfile = async (): Promise<void> => {
    try {
      const { data, error } = await supabase.rpc("ensure_own_profile");
      if (!isMounted.current) return;

      if (error) {
        console.error("[AuthContext] ensure_own_profile RPC error:", error.message);
        setProfile(null);
        return;
      }

      // RPC returns SETOF user_profiles — take the first (and only) row.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        console.error("[AuthContext] ensure_own_profile returned no rows.");
        setProfile(null);
        return;
      }

      setProfile(row as UserProfile);
    } catch (err) {
      if (!isMounted.current) return;
      console.error("[AuthContext] Unexpected error in ensure_own_profile:", err);
      setProfile(null);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  // ── Fetch profile with retry → auto-create ────────────────────────────────
  /**
   * Fetches the user_profiles row for `userId`.
   *
   * Retry strategy:
   *   - PGRST116 (no row found) → retry up to PROFILE_RETRY_LIMIT times with
   *     increasing delays. Keeps isLoading=true throughout.
   *   - Retries exhausted → call createFallbackProfile() to upsert via RPC.
   *   - Any other DB error → set profile=null and clear isLoading.
   *
   * The `scheduledRetry` flag prevents the finally block from clearing
   * isLoading prematurely when a retry or fallback creation is still in flight.
   */
  const fetchProfile = async (userId: string, attempt = 0): Promise<void> => {
    // When true, something else (retry timeout or createFallbackProfile) is
    // responsible for eventually calling setIsLoading(false).
    let scheduledRetry = false;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, full_name, role, company_id, avatar_url, created_at, updated_at")
        .eq("id", userId)
        .single();

      if (!isMounted.current) return;

      if (error) {
        if (error.code === "PGRST116") {
          if (attempt < PROFILE_RETRY_LIMIT) {
            // Trigger may not have fired yet — keep loading and retry.
            scheduledRetry = true;
            setTimeout(
              () => fetchProfile(userId, attempt + 1),
              PROFILE_RETRY_DELAY_MS * (attempt + 1),
            );
            return;
          }

          // All retries exhausted — profile row is genuinely missing.
          // Auto-create it via SECURITY DEFINER RPC.
          scheduledRetry = true; // createFallbackProfile owns setIsLoading(false)
          await createFallbackProfile();
          return;
        }

        // Non-PGRST116 DB error (network, permissions, etc.)
        console.error("[AuthContext] Error fetching user profile:", error.message);
        setProfile(null);
      } else {
        setProfile(data as UserProfile);
      }
    } catch (err) {
      if (!isMounted.current) return;
      console.error("[AuthContext] Unexpected error fetching profile:", err);
      setProfile(null);
    } finally {
      // Only clear loading if no retry / fallback creation is taking over.
      if (!scheduledRetry && isMounted.current) {
        setIsLoading(false);
      }
    }
  };

  // ── Auth state listener ──────────────────────────────────────────────────
  useEffect(() => {
    // 1. Hydrate from existing session in localStorage/cookie
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // 2. React to every auth event going forward
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted.current) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // INITIAL_SESSION fires on page load — profile already being fetched
        // above; skip the duplicate call to avoid a double-fetch race.
        if (event !== "INITIAL_SESSION") {
          setIsLoading(true);
          fetchProfile(session.user.id);
        }
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // State cleared by onAuthStateChange listener above
  };

  // ── Derived state ────────────────────────────────────────────────────────

  const isAuthenticated = !!session;
  const isAdmin         = profile?.role === "super_admin" || profile?.role === "company_admin";
  const isTelecaller    = profile?.role === "employee"; // "employee" = old "Telecaller"

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isLoading,
        isAuthenticated,
        isAdmin,
        isTelecaller,
        signOut,
        login,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
