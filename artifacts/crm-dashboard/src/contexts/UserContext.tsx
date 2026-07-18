import { createContext, useContext, useState, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'telecaller';

interface UserContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isAdmin: boolean;
  isTelecaller: boolean;
}

// ─── Phone masking ────────────────────────────────────────────────────────────
//
// Converts "+91 98001 11111" → "+91-980XX-XXXXX"
// The real number is never exposed to telecaller view, but action buttons
// (tel: links, WhatsApp deep links) still receive the unmasked value.

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    const local = digits.slice(-10); // last 10 digits = mobile number
    return `+91-${local.slice(0, 3)}XX-XXXXX`;
  }
  // Fallback for unusual formats
  return phone.slice(0, 5) + 'XX-XXXXX';
}

// ─── Context ──────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('admin');

  return (
    <UserContext.Provider
      value={{
        role,
        setRole,
        isAdmin:      role === 'admin',
        isTelecaller: role === 'telecaller',
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}
