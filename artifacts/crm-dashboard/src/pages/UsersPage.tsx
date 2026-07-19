/**
 * UsersPage — read-only list of all users in the same company, with an
 * "Add User" action for admins.
 *
 * Email is only available for the currently logged-in user (email lives in
 * auth.users, not user_profiles); other rows show "—".
 * Status is derived: all profiles are considered Active (no status column).
 */
import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  Users, Search, ShieldCheck, ShieldAlert,
  CircleUser, UserPlus, X, Eye, EyeOff,
} from 'lucide-react';
import { useAuth, type UserProfile } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = UserProfile['role'];

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'super_admin',   label: 'Super Admin'   },
  { value: 'company_admin', label: 'Company Admin' },
  { value: 'manager',       label: 'Manager'       },
  { value: 'employee',      label: 'Employee'      },
];

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<UserRole, { bg: string; text: string; border: string; icon: typeof ShieldCheck }> = {
  super_admin:   { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  icon: ShieldCheck },
  company_admin: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: ShieldCheck },
  manager:       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    icon: ShieldAlert },
  employee:      { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: ShieldAlert },
};

function RoleBadge({ role }: { role: UserRole }) {
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

function Avatar({ name, role }: { name: string; role: UserRole }) {
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

// ─── Add User Modal ───────────────────────────────────────────────────────────

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accessToken: string | undefined;
}

interface FormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const DEFAULT_FORM: FormState = {
  name: '', email: '', password: '', role: 'employee',
};

function AddUserModal({ open, onClose, onSuccess, accessToken }: AddUserModalProps) {
  const [form, setForm]           = useState<FormState>(DEFAULT_FORM);
  const [showPass, setShowPass]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Reset form whenever modal opens
  useEffect(() => {
    if (open) { setForm(DEFAULT_FORM); setError(null); setShowPass(false); }
  }, [open]);

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Basic client-side guard
    if (!form.name.trim())  { setError('Name is required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          name:     form.name.trim(),
          email:    form.email.trim(),
          password: form.password,
          role:     form.role,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }

      // 201 Created (or 207 partial — still treat as success)
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-md mx-4 bg-background rounded-2xl border border-border shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Add New User</h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Error banner */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Priya Sharma"
              disabled={submitting}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-60"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="priya@company.com"
              disabled={submitting}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-60"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="Min. 6 characters"
                disabled={submitting}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={form.role}
              onChange={e => set('role', e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-60"
            >
              {ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" />
                  Add User
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user, profile, session } = useAuth();

  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch all users in this company
  const fetchUsers = useCallback(async () => {
    if (!profile?.company_id) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, company_id, created_at')
      .eq('company_id', profile.company_id)
      .order('full_name', { ascending: true });
    if (!error && data) setMembers(data as UserProfile[]);
    setLoading(false);
  }, [profile?.company_id]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Search: match name or role label
  const filtered = members.filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.role.replace(/_/g, ' ').includes(q)
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
            All members in your organisation.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors self-start"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
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
                    {search
                      ? `No users match "${search}".`
                      : 'No users found for this company.'}
                  </td>
                </tr>
              ) : (
                filtered.map((m, idx) => {
                  const isSelf = m.id === user?.id;
                  const email  = isSelf ? (user?.email ?? '—') : '—';
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

      {/* ── Add User Modal ───────────────────────────────────────────────────── */}
      <AddUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchUsers}
        accessToken={session?.access_token}
      />

    </div>
  );
}
