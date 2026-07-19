/**
 * UsersPage — read-only list of all users in the same company.
 *
 * Shows: Name, Email, Role, Status.
 * Email is only available for the currently logged-in user from the Supabase
 * session; other rows show "—" (email lives in auth.users, not user_profiles).
 * Status is derived: all profiles are considered Active (no status column exists).
 */
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Users, Search, ShieldCheck, ShieldAlert, CircleUser } from 'lucide-react';
import { useAuth, type UserProfile } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<UserProfile['role'], { bg: string; text: string; border: string; icon: typeof ShieldCheck }> = {
  super_admin:   { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  icon: ShieldCheck },
  company_admin: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: ShieldCheck },
  manager:       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    icon: ShieldAlert },
  employee:      { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: ShieldAlert },
};

function RoleBadge({ role }: { role: UserProfile['role'] }) {
  const s = ROLE_STYLES[role] ?? ROLE_STYLES.employee;
  const Icon = s.icon;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
      s.bg, s.text, s.border,
    )}>
      <Icon className="h-3 w-3" />
      {role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────

function Avatar({ name, role }: { name: string; role: UserProfile['role'] }) {
  const isAdmin = role === 'super_admin' || role === 'company_admin';
  const initials = name
    .split(' ')
    .map(n => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={clsx(
      'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold flex-shrink-0',
      isAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
    )}>
      {initials || <CircleUser className="h-4 w-4" />}
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-border animate-pulse">
      <td className="px-5 py-4"><div className="h-3 w-6 rounded bg-muted" /></td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>
      </td>
      <td className="px-5 py-4"><div className="h-3 w-40 rounded bg-muted" /></td>
      <td className="px-5 py-4"><div className="h-5 w-24 rounded-full bg-muted" /></td>
      <td className="px-5 py-4"><div className="h-5 w-16 rounded-full bg-muted" /></td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user, profile } = useAuth();

  const [members, setMembers]   = useState<UserProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState('');

  // Fetch all users in this company
  useEffect(() => {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    supabase
      .from('user_profiles')
      .select('id, full_name, role, company_id, avatar_url, created_at, updated_at')
      .eq('company_id', profile.company_id)
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setMembers(data as UserProfile[]);
        setLoading(false);
      });
  }, [profile?.company_id]);

  // Search: match name or role label
  const filtered = members.filter(m => {
    if (!search.trim()) return true;
    const q   = search.toLowerCase();
    const rl  = m.role.replace(/_/g, ' ');
    return (
      m.full_name.toLowerCase().includes(q) ||
      rl.includes(q)
    );
  });

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            All members in your organisation — read-only view.
          </p>
        </div>
        <div className="text-xs text-muted-foreground bg-muted/60 border border-border rounded-lg px-3 py-2 self-start">
          {loading ? '…' : `${members.length} user${members.length !== 1 ? 's' : ''} total`}
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or role…"
          className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
        />
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-12">#</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {search ? `No users match "${search}".` : 'No users found for this company.'}
                  </td>
                </tr>
              ) : (
                filtered.map((m, idx) => {
                  const isSelf  = m.id === user?.id;
                  const email   = isSelf ? (user?.email ?? '—') : '—';
                  return (
                    <tr
                      key={m.id}
                      className={clsx(
                        'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                        isSelf ? 'bg-primary/5' : idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                      )}
                    >
                      {/* # */}
                      <td className="px-5 py-4 text-xs font-mono text-muted-foreground">
                        {String(idx + 1).padStart(2, '0')}
                      </td>

                      {/* Name */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m.full_name} role={m.role} />
                          <div>
                            <p className="font-semibold text-foreground">{m.full_name || '—'}</p>
                            {isSelf && (
                              <p className="text-xs text-primary font-medium">you</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {email}
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <RoleBadge role={m.role} />
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Showing {filtered.length} of {members.length} user{members.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </div>
        )}
      </div>

    </div>
  );
}
