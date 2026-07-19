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
  created_at: string;
  // avatar_url and updated_at are not present in the live schema
  avatar_url?: string | null;
  updated_at?: string;
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

  // ── Onboarding RPC ───────────────────────────────────────────────────────
  /**
   * Calls the `onboard_user` SECURITY DEFINER RPC which, in a single
   * transaction:
   *   1. Upserts the user_profiles row (creates it if missing).
   *   2. If company_id is NULL, finds or creates a company and assigns the
   *      user as company_admin (first on domain) or employee (subsequent).
   *   3. Guarantees role is never NULL.
   *   4. Returns the fully-populated profile row.
   *
   * Idempotent — safe to call on every login; repeated calls are no-ops for
   * users whose profile, company, and role are already set.
   */
  const runOnboarding = async (): Promise<void> => {
    try {
      const { data, error } = await supabase.rpc("onboard_user");
      if (!isMounted.current) return;

      if (error) {
        console.error("[AuthContext] onboard_user RPC error:", error.message);
        setProfile(null);
        return;
      }

      // RPC returns SETOF user_profiles — take the first (and only) row.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        console.error("[AuthContext] onboard_user returned no rows.");
        setProfile(null);
        return;
      }

      setProfile(row as UserProfile);
    } catch (err) {
      if (!isMounted.current) return;
      console.error("[AuthContext] Unexpected error in onboard_user:", err);
      setProfile(null);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  // ── Auth state listener ──────────────────────────────────────────────────
  useEffect(() => {
    // 1. Hydrate from existing session in localStorage/cookie, then onboard.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        runOnboarding();
      } else {
        setIsLoading(false);
      }
    });

    // 2. React to every auth event going forward.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted.current) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // INITIAL_SESSION fires on page load — onboarding already running
        // from getSession() above; skip to avoid a duplicate RPC call.
        if (event !== "INITIAL_SESSION") {
          setIsLoading(true);
          runOnboarding();
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
