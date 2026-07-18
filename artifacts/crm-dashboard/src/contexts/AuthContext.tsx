import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'Admin' | 'Telecaller';

export interface AuthUser {
  id:    string;
  email: string;
  name:  string;
  role:  UserRole;
}

interface AuthContextType {
  user:            AuthUser | null;
  login:           (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout:          () => void;
  isAuthenticated: boolean;
  isAdmin:         boolean;
  isTelecaller:    boolean;
}

// ─── Mock credentials ─────────────────────────────────────────────────────────
// Replace with Supabase Auth when ready — only the login() function changes.

type MockUser = AuthUser & { password: string };

export const MOCK_USERS: MockUser[] = [
  { id: '1', email: 'admin@test.com',       password: 'admin123', name: 'Admin User',  role: 'Admin'      },
  { id: '2', email: 'telecaller@test.com',  password: 'tele123',  name: 'Ravi Kumar',  role: 'Telecaller' },
  { id: '3', email: 'tele2@test.com',       password: 'tele123',  name: 'Sunita Rao',  role: 'Telecaller' },
];

// Safe user list for Admin Panel (no passwords)
export const ALL_USERS: AuthUser[] = MOCK_USERS.map(({ password: _p, ...u }) => u);

const STORAGE_KEY = 'crm_auth_user';

// ─── Phone masking ────────────────────────────────────────────────────────────
// Exported so Leads, Pipeline, WhatsApp can mask for Telecaller view.
// The *real* number is always passed to tel:/wa.me links — only display is masked.

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    const local = digits.slice(-10);
    return `+91-${local.slice(0, 3)}XX-XXXXX`;
  }
  return `${phone.slice(0, 5)}XX-XXXXX`;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Restore session from localStorage on first render
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const found = MOCK_USERS.find(
        u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
      );
      if (!found) {
        return { success: false, error: 'Invalid email or password. Please try again.' };
      }
      const authUser: AuthUser = { id: found.id, email: found.email, name: found.name, role: found.role };
      setUser(authUser);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser)); } catch { /* quota exceeded */ }
      return { success: true };
    },
    [],
  );

  const logout = useCallback(() => {
    setUser(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: user !== null,
        isAdmin:         user?.role === 'Admin',
        isTelecaller:    user?.role === 'Telecaller',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
