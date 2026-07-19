import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  ShieldAlert, ShieldCheck, Building2, Users2, Mail, ChevronDown,
  Loader2, Plus, Trash2, Settings2, Check, Clock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type InviteRole = 'manager' | 'employee';
type InviteStatus = 'pending' | 'accepted' | 'expired';

interface CompanyData {
  id:      string;
  name:    string;
  slug:    string;
  plan:    string;
  address: string | null;
}

interface CompanyForm {
  name:    string;
  address: string;
}

interface PendingInvite {
  id:         string;
  email:      string;
  role:       InviteRole;
  status:     InviteStatus;
  created_at: string;
}

interface InviteForm {
  email: string;
  role:  InviteRole;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: 'manager',  label: 'Manager'  },
  { value: 'employee', label: 'Employee' },
];

const STATUS_STYLE: Record<InviteStatus, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired:  'bg-muted text-muted-foreground border-border',
};

const STATUS_ICON: Record<InviteStatus, React.ElementType> = {
  pending:  Clock,
  accepted: Check,
  expired:  ShieldAlert,
};

const EMPTY_INVITE: InviteForm = { email: '', role: 'employee' };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Admin gate ───────────────────────────────────────────────────────────────

function AdminGate() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-5">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">Admin Access Required</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Only users with a <strong>Company Admin</strong> or <strong>Super Admin</strong> role
        can view and manage Settings. Contact your administrator for access.
      </p>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, sub, icon: Icon, children }: {
  title: string; sub: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-foreground mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function inputClass(error?: string) {
  return clsx(
    'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground',
    'placeholder:text-muted-foreground outline-none transition-colors',
    'focus:ring-2 focus:ring-primary/30',
    error ? 'border-destructive' : 'border-border focus:border-primary',
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { profile, isAdmin, user } = useAuth();

  // ── State ────────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<'company' | 'team'>('company');
  const [company,      setCompany]      = useState<CompanyData | null>(null);
  const [companyForm,  setCompanyForm]  = useState<CompanyForm>({ name: '', address: '' });
  const [companyErrs,  setCompanyErrs]  = useState<Partial<CompanyForm>>({});
  const [savingCo,     setSavingCo]     = useState(false);
  const [loadingCo,    setLoadingCo]    = useState(true);

  const [invites,      setInvites]      = useState<PendingInvite[]>([]);
  const [loadingInv,   setLoadingInv]   = useState(false);
  const [invLoaded,    setInvLoaded]    = useState(false);
  const [inviteForm,   setInviteForm]   = useState<InviteForm>(EMPTY_INVITE);
  const [inviteErrs,   setInviteErrs]   = useState<Partial<InviteForm>>({});
  const [sendingInv,   setSendingInv]   = useState(false);
  const [revokingId,   setRevokingId]   = useState<string | null>(null);

  // ── Fetch company ────────────────────────────────────────────────────────
  const fetchCompany = useCallback(async () => {
    if (!profile?.company_id) { setLoadingCo(false); return; }
    setLoadingCo(true);
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, slug, plan, address')
      .eq('id', profile.company_id)
      .single();
    setLoadingCo(false);
    if (error) {
      toast.error('Failed to load company profile', { description: error.message });
      return;
    }
    const co = data as CompanyData;
    setCompany(co);
    setCompanyForm({ name: co.name, address: co.address ?? '' });
  }, [profile?.company_id]);

  // ── Fetch pending invites ────────────────────────────────────────────────
  const fetchInvites = useCallback(async () => {
    setLoadingInv(true);
    const { data, error } = await supabase
      .from('pending_invites')
      .select('id, email, role, status, created_at')
      .order('created_at', { ascending: false });
    setLoadingInv(false);
    setInvLoaded(true);
    if (error) {
      toast.error('Failed to load invites', { description: error.message });
      return;
    }
    setInvites((data ?? []) as PendingInvite[]);
  }, []);

  useEffect(() => { fetchCompany(); }, [fetchCompany]);

  useEffect(() => {
    if (activeTab === 'team' && !invLoaded) fetchInvites();
  }, [activeTab, invLoaded, fetchInvites]);

  // ── Save company profile ─────────────────────────────────────────────────
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Partial<CompanyForm> = {};
    if (!companyForm.name.trim()) errs.name = 'Company name is required';
    if (Object.keys(errs).length) { setCompanyErrs(errs); return; }

    if (!profile?.company_id) return;
    setSavingCo(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name:    companyForm.name.trim(),
        address: companyForm.address.trim() || null,
      })
      .eq('id', profile.company_id);
    setSavingCo(false);

    if (error) {
      toast.error('Failed to save company profile', { description: error.message });
      return;
    }
    toast.success('Company profile updated');
    setCompany(c => c ? { ...c, name: companyForm.name.trim(), address: companyForm.address.trim() || null } : c);
    setCompanyErrs({});
  };

  // ── Send invite ──────────────────────────────────────────────────────────
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Partial<InviteForm> = {};
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!inviteForm.email.trim())         errs.email = 'Email is required';
    else if (!emailRe.test(inviteForm.email)) errs.email = 'Enter a valid email address';
    if (Object.keys(errs).length) { setInviteErrs(errs); return; }

    if (!profile?.company_id) return;
    setSendingInv(true);
    const { data, error } = await supabase
      .from('pending_invites')
      .insert({
        company_id: profile.company_id,
        email:      inviteForm.email.trim().toLowerCase(),
        role:       inviteForm.role,
        invited_by: user?.id ?? null,
        status:     'pending',
      })
      .select()
      .single();
    setSendingInv(false);

    if (error) {
      const isConflict = error.code === '23505';
      toast.error(
        isConflict ? 'Invite already sent' : 'Failed to send invite',
        { description: isConflict ? `${inviteForm.email} already has a pending invite.` : error.message },
      );
      return;
    }
    toast.success(`Invite sent to ${inviteForm.email}`);
    setInvites(prev => [data as PendingInvite, ...prev]);
    setInviteForm(EMPTY_INVITE);
    setInviteErrs({});
  };

  // ── Revoke invite ────────────────────────────────────────────────────────
  const handleRevoke = async (invite: PendingInvite) => {
    setRevokingId(invite.id);
    const { error } = await supabase
      .from('pending_invites')
      .delete()
      .eq('id', invite.id);
    setRevokingId(null);

    if (error) {
      toast.error('Failed to revoke invite', { description: error.message });
      return;
    }
    toast.success(`Invite for ${invite.email} revoked`);
    setInvites(prev => prev.filter(i => i.id !== invite.id));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // All hooks are called above — early return is safe here
  if (!isAdmin) return <AdminGate />;

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
          <Settings2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your company profile and team access.
          </p>
        </div>

        {/* Admin badge */}
        <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 self-start">
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin Access
        </div>
      </div>

      {/* No company guard */}
      {!loadingCo && !profile?.company_id && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <ShieldAlert className="h-4 w-4 flex-shrink-0" />
          Your account is not linked to a company yet. Contact a super admin to be assigned.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          ['company', 'Company Profile', Building2],
          ['team',    'Team Management', Users2   ],
        ] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Company Profile tab ───────────────────────────────────────────── */}
      {activeTab === 'company' && (
        <Section
          icon={Building2}
          title="Company Profile"
          sub="Update your company name and address. Changes are scoped to your organisation."
        >
          {loadingCo ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2].map(i => (
                <div key={i}>
                  <div className="h-3 w-28 rounded bg-muted mb-2" />
                  <div className="h-10 rounded-lg bg-muted" />
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSaveCompany} noValidate className="space-y-4">
              <Field label="Company Name" required error={companyErrs.name}>
                <input
                  type="text"
                  value={companyForm.name}
                  onChange={e => { setCompanyForm(f => ({ ...f, name: e.target.value })); setCompanyErrs(er => ({ ...er, name: undefined })); }}
                  placeholder="e.g. Acme Corp"
                  className={inputClass(companyErrs.name)}
                />
              </Field>

              <Field label="Address" error={companyErrs.address}>
                <textarea
                  rows={3}
                  value={companyForm.address}
                  onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="e.g. 12, MG Road, Bengaluru, Karnataka 560001"
                  className={clsx(inputClass(), 'resize-none')}
                />
              </Field>

              {/* Read-only fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Company Slug</p>
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground font-mono">
                    {company?.slug ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">URL identifier — cannot be changed.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Plan</p>
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground capitalize">
                    {company?.plan ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Contact support to upgrade.</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingCo}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {savingCo && <Loader2 className="h-4 w-4 animate-spin" />}
                  {savingCo ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </Section>
      )}

      {/* ── Team Management tab ───────────────────────────────────────────── */}
      {activeTab === 'team' && (
        <div className="space-y-5">

          {/* Invite form */}
          <Section
            icon={Mail}
            title="Invite Team Member"
            sub="Send an invite to a new user. They will join your company once they sign up."
          >
            <form onSubmit={handleSendInvite} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
                <Field label="Email Address" required error={inviteErrs.email}>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={e => { setInviteForm(f => ({ ...f, email: e.target.value })); setInviteErrs(er => ({ ...er, email: undefined })); }}
                    placeholder="colleague@company.com"
                    className={inputClass(inviteErrs.email)}
                  />
                </Field>

                <Field label="Role">
                  <div className="relative">
                    <select
                      value={inviteForm.role}
                      onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as InviteRole }))}
                      className={clsx(inputClass(), 'appearance-none pr-8 cursor-pointer')}
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </Field>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sendingInv}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {sendingInv
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                    : <><Plus className="h-4 w-4" /> Send Invite</>
                  }
                </button>
              </div>
            </form>
          </Section>

          {/* Pending invites list */}
          <Section
            icon={Users2}
            title="Pending Invites"
            sub="Invites that have been sent but not yet accepted."
          >
            {loadingInv ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-4 flex-1 rounded bg-muted" />
                    <div className="h-4 w-20 rounded bg-muted" />
                    <div className="h-4 w-16 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : invites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Mail className="h-8 w-8 opacity-25 mb-2" />
                <p className="text-sm">No invites sent yet.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Sent</th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite, idx) => {
                      const StatusIcon = STATUS_ICON[invite.status];
                      return (
                        <tr
                          key={invite.id}
                          className={clsx(
                            'border-b border-border last:border-0 transition-colors hover:bg-muted/20',
                            idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                          )}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                                {invite.email.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-foreground truncate max-w-[180px]">
                                {invite.email}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            <span className="capitalize text-muted-foreground">{invite.role}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={clsx(
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize',
                              STATUS_STYLE[invite.status],
                            )}>
                              <StatusIcon className="h-3 w-3" />
                              {invite.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                            {timeAgo(invite.created_at)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {invite.status === 'pending' && (
                              <button
                                onClick={() => handleRevoke(invite)}
                                disabled={revokingId === invite.id}
                                title="Revoke invite"
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 ml-auto"
                              >
                                {revokingId === invite.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Trash2 className="h-3.5 w-3.5" />
                                }
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
