/**
 * Call Log Page
 *
 * Records every outbound call a telecaller makes to a lead.
 *
 * Data sources (no backend changes):
 *   supabase  → call_logs table (new migration 000023)
 *   useLeads()  → lead list for the "Log a Call" picker
 *   useAuth()   → profile, role scoping, phone masking
 *   React Query → caching, mutations, invalidation
 *
 * Scoping:
 *   Telecallers (role = 'employee') see only their own logs.
 *   Admins / managers see all logs and the "By" column.
 *   Delete is available to the log's author or any manager+.
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import {
  Phone, PhoneCall, PhoneMissed, PhoneOff, PhoneForwarded,
  Clock, Plus, X, Search, Loader2, Trash2,
  Calendar, CheckCircle2, ChevronDown, Filter, Zap,
} from 'lucide-react';
import { useLeads }            from '@/contexts/LeadsContext';
import { useAuth, maskPhone }  from '@/contexts/AuthContext';
import { supabase }            from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallLog {
  id:               number;
  company_id:       string | null;
  lead_id:          number | null;
  lead_name:        string;
  lead_phone:       string;
  called_by:        string | null;
  called_by_name:   string;
  called_at:        string;   // ISO timestamp (UTC)
  duration_seconds: number | null;
  outcome:          string;
  notes:            string;
  follow_up_at:     string | null;
  created_at:       string;
}

interface LogCallForm {
  leadId:      string;
  calledAt:    string;   // YYYY-MM-DDTHH:MM (local, for datetime-local input)
  durationMin: string;
  durationSec: string;
  outcome:     Outcome;
  notes:       string;
  followUpAt:  string;  // YYYY-MM-DDTHH:MM (local), only required when outcome = 'Follow-up'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTCOMES = [
  'Connected',
  'No Answer',
  'Busy',
  'Wrong Number',
  'Follow-up',
  'Converted',
] as const;

type Outcome = (typeof OUTCOMES)[number];

const OUTCOME_META: Record<Outcome, { badge: string; icon: React.ElementType }> = {
  'Connected':    { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: PhoneCall     },
  'No Answer':    { badge: 'bg-amber-100   text-amber-700   border-amber-200',   icon: PhoneMissed   },
  'Busy':         { badge: 'bg-orange-100  text-orange-700  border-orange-200',  icon: PhoneOff      },
  'Wrong Number': { badge: 'bg-gray-100    text-gray-600    border-gray-200',    icon: Phone         },
  'Follow-up':    { badge: 'bg-blue-100    text-blue-700    border-blue-200',    icon: PhoneForwarded },
  'Converted':    { badge: 'bg-teal-100    text-teal-700    border-teal-200',    icon: Zap           },
};

type DateFilter = 'all' | 'today' | 'week' | 'month';

const DATE_LABELS: Record<DateFilter, string> = {
  all:   'All Time',
  today: 'Today',
  week:  'This Week',
  month: 'This Month',
};

const EMPTY_FORM: Omit<LogCallForm, 'calledAt'> = {
  leadId:      '',
  durationMin: '',
  durationSec: '',
  outcome:     'Connected',
  notes:       '',
  followUpAt:  '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DDTHH:MM" in local time for a datetime-local input default. */
function nowLocalDT(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fmtDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function isInDateRange(isoUtc: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const d   = new Date(isoUtc);
  const now = new Date();
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // start of today
  if (filter === 'today') return d >= sod;
  if (filter === 'week') {
    const sow = new Date(sod);
    sow.setDate(sod.getDate() - now.getDay());
    return d >= sow;
  }
  if (filter === 'month') {
    return d >= new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return true;
}

function avgDuration(logs: CallLog[]): string {
  const with_ = logs.filter(l => l.duration_seconds);
  if (!with_.length) return '—';
  const avg = Math.round(with_.reduce((s, l) => s + (l.duration_seconds ?? 0), 0) / with_.length);
  return fmtDuration(avg);
}

// ── OutcomeBadge ──────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
  const meta = OUTCOME_META[outcome as Outcome];
  const Icon = meta?.icon ?? Phone;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
      meta?.badge ?? 'bg-gray-100 text-gray-600 border-gray-200',
    )}>
      <Icon size={10} />
      {outcome}
    </span>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

type CardColor = 'blue' | 'emerald' | 'amber' | 'violet';

const CARD_COLORS: Record<CardColor, { wrap: string; icon: string; val: string }> = {
  blue:    { wrap: 'bg-blue-50    border-blue-100',    icon: 'bg-blue-100    text-blue-600',    val: 'text-blue-700'    },
  emerald: { wrap: 'bg-emerald-50 border-emerald-100', icon: 'bg-emerald-100 text-emerald-600', val: 'text-emerald-700' },
  amber:   { wrap: 'bg-amber-50   border-amber-100',   icon: 'bg-amber-100   text-amber-600',   val: 'text-amber-700'   },
  violet:  { wrap: 'bg-violet-50  border-violet-100',  icon: 'bg-violet-100  text-violet-600',  val: 'text-violet-700'  },
};

function SummaryCard({
  label, value, sub, icon: Icon, color, loading,
}: {
  label:    string;
  value:    number | string;
  sub?:     string;
  icon:     React.ElementType;
  color:    CardColor;
  loading?: boolean;
}) {
  const c = CARD_COLORS[color];
  return (
    <div className={`rounded-xl border p-5 flex items-start gap-4 ${c.wrap}`}>
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${c.icon}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {loading
          ? <div className="h-8 w-14 bg-muted/60 animate-pulse rounded mt-1" />
          : <p className={`text-3xl font-bold mt-0.5 tabular-nums ${c.val}`}>{value}</p>
        }
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Log Call Sheet ────────────────────────────────────────────────────────────

function LogCallSheet({
  open, onClose, onSubmit, submitting,
}: {
  open:       boolean;
  onClose:    () => void;
  onSubmit:   (form: LogCallForm) => void;
  submitting: boolean;
}) {
  const { leads }        = useLeads();
  const { isTelecaller } = useAuth();

  const [form, setForm]           = useState<LogCallForm>({ ...EMPTY_FORM, calledAt: nowLocalDT() });
  const [errors, setErrors]       = useState<Partial<Record<keyof LogCallForm, string>>>({});
  const [leadSearch, setLeadSearch] = useState('');

  // Reset every time the sheet opens
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, calledAt: nowLocalDT() });
      setErrors({});
      setLeadSearch('');
    }
  }, [open]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    return q
      ? leads.filter(l => l.name.toLowerCase().includes(q) || l.phone.includes(q))
      : leads;
  }, [leads, leadSearch]);

  const set = <K extends keyof LogCallForm>(k: K, v: LogCallForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof LogCallForm, string>> = {};
    if (!form.leadId)   e.leadId   = 'Select a lead';
    if (!form.calledAt) e.calledAt = 'Enter the call date and time';
    if (form.outcome === 'Follow-up' && !form.followUpAt)
      e.followUpAt = 'Enter a follow-up date and time';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    if (validate()) onSubmit(form);
  };

  if (!open) return null;

  const inputCls = (err?: string) => clsx(
    'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none',
    'placeholder:text-muted-foreground transition-colors',
    'focus:border-primary focus:ring-2 focus:ring-primary/20',
    err ? 'border-destructive' : 'border-border',
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card shadow-2xl sm:w-[440px] border-l border-border">

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Log a Call</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Record the outcome of a call with a lead</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Lead picker */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Lead <span className="text-destructive">*</span>
              </label>
              <div className="relative mb-2">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search leads…"
                  value={leadSearch}
                  onChange={e => setLeadSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <select
                value={form.leadId}
                onChange={e => { set('leadId', e.target.value); setErrors(x => ({ ...x, leadId: undefined })); }}
                size={Math.min(6, Math.max(filteredLeads.length, 2))}
                className={clsx(
                  'w-full rounded-lg border bg-background text-sm text-foreground outline-none',
                  'focus:border-primary focus:ring-2 focus:ring-primary/20',
                  errors.leadId ? 'border-destructive' : 'border-border',
                )}
              >
                {filteredLeads.length === 0 ? (
                  <option disabled value="">No leads found</option>
                ) : (
                  filteredLeads.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {isTelecaller ? maskPhone(l.phone) : l.phone}
                    </option>
                  ))
                )}
              </select>
              {errors.leadId && <p className="mt-1 text-xs text-destructive">{errors.leadId}</p>}
            </div>

            {/* Called at */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Called At <span className="text-destructive">*</span>
              </label>
              <input
                type="datetime-local"
                value={form.calledAt}
                onChange={e => { set('calledAt', e.target.value); setErrors(x => ({ ...x, calledAt: undefined })); }}
                className={inputCls(errors.calledAt)}
              />
              {errors.calledAt && <p className="mt-1 text-xs text-destructive">{errors.calledAt}</p>}
            </div>

            {/* Outcome dropdown */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Outcome <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.outcome}
                  onChange={e => {
                    set('outcome', e.target.value as Outcome);
                    // Clear follow-up date when switching away from Follow-up
                    if (e.target.value !== 'Follow-up') set('followUpAt', '');
                  }}
                  className={clsx(inputCls(), 'appearance-none pr-8')}
                >
                  {OUTCOMES.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Follow-up date & time – visible only when outcome = 'Follow-up' */}
            {form.outcome === 'Follow-up' && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Follow-up Date & Time <span className="text-destructive">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.followUpAt}
                  onChange={e => { set('followUpAt', e.target.value); setErrors(x => ({ ...x, followUpAt: undefined })); }}
                  className={inputCls(errors.followUpAt)}
                />
                {errors.followUpAt && <p className="mt-1 text-xs text-destructive">{errors.followUpAt}</p>}
              </div>
            )}

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Duration{' '}
                <span className="text-[11px] font-normal text-muted-foreground">(optional)</span>
              </label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="number" min="0" max="999" placeholder="0"
                    value={form.durationMin}
                    onChange={e => set('durationMin', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">minutes</p>
                </div>
                <div className="flex-1">
                  <input
                    type="number" min="0" max="59" placeholder="0"
                    value={form.durationSec}
                    onChange={e => set('durationSec', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">seconds</p>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                placeholder="What was discussed? Any next steps?"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-shrink-0 flex-col-reverse gap-3 border-t border-border bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto sm:py-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:w-auto sm:py-2.5"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />}
              Log Call
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CallLogPage() {
  const qc = useQueryClient();
  const { profile, isAuthenticated, isTelecaller, isAdmin } = useAuth();
  const { leads } = useLeads();

  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [search,         setSearch]         = useState('');
  const [outcomeFilter,  setOutcomeFilter]  = useState<Outcome | 'all'>('all');
  const [dateFilter,     setDateFilter]     = useState<DateFilter>('all');
  const [deletingId,     setDeletingId]     = useState<number | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const { data: logs = [], isLoading } = useQuery<CallLog[]>({
    queryKey: ['call-logs', isTelecaller ? profile?.id : 'all'],
    queryFn: async () => {
      let q = supabase
        .from('call_logs')
        .select('*')
        .order('called_at', { ascending: false })
        .limit(500);

      // Telecallers only see their own logs (defence-in-depth on top of RLS)
      if (isTelecaller && profile?.id) {
        q = q.eq('called_by', profile.id);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CallLog[];
    },
    enabled: isAuthenticated,
  });

  // ── Log a call ───────────────────────────────────────────────────────────────

  const logMutation = useMutation({
    mutationFn: async (form: LogCallForm) => {
      const lead = leads.find(l => l.id === Number(form.leadId));
      if (!lead) throw new Error('Lead not found');

      const durationSeconds =
        (parseInt(form.durationMin || '0') * 60 + parseInt(form.durationSec || '0')) || null;

      const { error } = await supabase.from('call_logs').insert({
        company_id:       profile?.company_id ?? null,
        lead_id:          lead.id,
        lead_name:        lead.name,
        lead_phone:       lead.phone,
        called_by:        profile?.id ?? null,
        called_by_name:   profile?.full_name ?? '',
        called_at:        new Date(form.calledAt).toISOString(),
        duration_seconds: durationSeconds,
        outcome:          form.outcome,
        notes:            form.notes,
        follow_up_at:     form.followUpAt ? new Date(form.followUpAt).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      toast.success('Call logged');
      setSheetOpen(false);
    },
    onError: (err: Error) => toast.error('Failed to log call', { description: err.message }),
  });

  // ── Delete ───────────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('call_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      toast.success('Log deleted');
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast.error('Failed to delete', { description: err.message });
      setDeletingId(null);
    },
  });

  const handleDelete = (id: number) => {
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(log => {
      if (q && !log.lead_name.toLowerCase().includes(q)
               && !log.lead_phone.includes(q)
               && !log.notes.toLowerCase().includes(q)) return false;
      if (outcomeFilter !== 'all' && log.outcome !== outcomeFilter) return false;
      if (!isInDateRange(log.called_at, dateFilter)) return false;
      return true;
    });
  }, [logs, search, outcomeFilter, dateFilter]);

  // ── Summary stats (scoped to today) ──────────────────────────────────────────

  const todaysLogs = useMemo(() => logs.filter(l => isInDateRange(l.called_at, 'today')), [logs]);

  const connectedToday = todaysLogs.filter(
    l => l.outcome === 'Connected' || l.outcome === 'Converted',
  ).length;

  const noAnswerToday = todaysLogs.filter(l => l.outcome === 'No Answer').length;

  const avgToday = useMemo(() => avgDuration(todaysLogs), [todaysLogs]);

  const hasFilters = search || outcomeFilter !== 'all' || dateFilter !== 'all';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <PhoneCall size={22} className="text-primary" />
              Call Log
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isTelecaller ? 'Your call history and outcomes' : 'All telecaller call history'}
            </p>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:self-auto"
          >
            <Plus size={15} />
            Log a Call
          </button>
        </div>

        {/* ── Summary cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Today's Calls"
            value={todaysLogs.length}
            sub="logged today"
            icon={PhoneCall}
            color="blue"
            loading={isLoading}
          />
          <SummaryCard
            label="Connected"
            value={connectedToday}
            sub="interested today"
            icon={CheckCircle2}
            color="emerald"
            loading={isLoading}
          />
          <SummaryCard
            label="No Answer"
            value={noAnswerToday}
            sub="missed today"
            icon={PhoneMissed}
            color="amber"
            loading={isLoading}
          />
          <SummaryCard
            label="Avg Duration"
            value={isLoading ? '—' : avgToday}
            sub="today's answered calls"
            icon={Clock}
            color="violet"
            loading={isLoading}
          />
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Search */}
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by lead, phone or notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Outcome */}
          <div className="relative flex-shrink-0">
            <Filter size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={outcomeFilter}
              onChange={e => setOutcomeFilter(e.target.value as Outcome | 'all')}
              className="min-w-[160px] appearance-none rounded-xl border border-border bg-card py-2.5 pl-8 pr-8 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Outcomes</option>
              {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Date range */}
          <div className="relative flex-shrink-0">
            <Calendar size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as DateFilter)}
              className="min-w-[140px] appearance-none rounded-xl border border-border bg-card py-2.5 pl-8 pr-8 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {(Object.keys(DATE_LABELS) as DateFilter[]).map(k => (
                <option key={k} value={k}>{DATE_LABELS[k]}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">

          {/* Table header row */}
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
            <p className="text-sm font-semibold text-foreground">
              {isLoading ? 'Loading…' : (
                <>
                  {filtered.length}{' '}
                  {filtered.length === 1 ? 'call' : 'calls'}
                  {hasFilters && ' (filtered)'}
                </>
              )}
            </p>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setOutcomeFilter('all'); setDateFilter('all'); }}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Loading */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 size={28} className="animate-spin text-primary/40" />
              <p className="text-sm">Loading call logs…</p>
            </div>

          /* Empty state */
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/50">
                <PhoneCall size={24} className="text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No call logs found</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {logs.length === 0
                    ? 'Log your first call using the button above.'
                    : 'Try changing the filters.'}
                </p>
              </div>
              {logs.length === 0 && (
                <button
                  onClick={() => setSheetOpen(true)}
                  className="mt-1 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus size={14} /> Log a Call
                </button>
              )}
            </div>

          /* Data table */
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {[
                      'Date & Time', 'Lead', 'Phone', 'Outcome',
                      'Duration', 'Notes', 'Follow-up',
                      ...(!isTelecaller ? ['By'] : []),
                      '',
                    ].map((h, i) => (
                      <th
                        key={i}
                        className={clsx(
                          'px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                          i === 0 || h !== '' ? 'text-left' : 'text-right',
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log, idx) => {
                    const { date, time } = fmtDateTime(log.called_at);
                    const canDelete = isAdmin || log.called_by === profile?.id;
                    return (
                      <tr
                        key={log.id}
                        className={clsx(
                          'border-b border-border last:border-0 transition-colors hover:bg-muted/20',
                          idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                        )}
                      >
                        {/* Date & Time */}
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <p className="text-xs font-medium text-foreground">{date}</p>
                          <p className="text-[11px] text-muted-foreground">{time}</p>
                        </td>

                        {/* Lead */}
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold uppercase text-primary">
                              {log.lead_name.charAt(0)}
                            </div>
                            <span className="max-w-[130px] truncate text-sm font-medium text-foreground">
                              {log.lead_name}
                            </span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <a
                            href={`tel:${log.lead_phone}`}
                            className="flex items-center gap-1 font-mono text-xs text-primary transition-colors hover:text-primary/80"
                          >
                            <Phone size={10} />
                            {isTelecaller ? maskPhone(log.lead_phone) : log.lead_phone}
                          </a>
                        </td>

                        {/* Outcome */}
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <OutcomeBadge outcome={log.outcome} />
                        </td>

                        {/* Duration */}
                        <td className="whitespace-nowrap px-5 py-3.5 text-xs tabular-nums text-muted-foreground">
                          {fmtDuration(log.duration_seconds)}
                        </td>

                        {/* Notes */}
                        <td className="max-w-[200px] px-5 py-3.5">
                          {log.notes ? (
                            <p className="truncate text-xs text-foreground" title={log.notes}>
                              {log.notes}
                            </p>
                          ) : (
                            <span className="text-[11px] italic text-muted-foreground/50">—</span>
                          )}
                        </td>

                        {/* Follow-up */}
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {log.follow_up_at ? (() => {
                            const { date, time } = fmtDateTime(log.follow_up_at);
                            return (
                              <div className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5">
                                <Calendar size={10} className="text-blue-500 flex-shrink-0" />
                                <span className="text-[11px] font-medium text-blue-700">{date}</span>
                                <span className="text-[11px] text-blue-500">{time}</span>
                              </div>
                            );
                          })() : (
                            <span className="text-[11px] italic text-muted-foreground/50">—</span>
                          )}
                        </td>

                        {/* By (managers+) */}
                        {!isTelecaller && (
                          <td className="max-w-[120px] truncate whitespace-nowrap px-5 py-3.5 text-xs text-muted-foreground">
                            {log.called_by_name || '—'}
                          </td>
                        )}

                        {/* Delete */}
                        <td className="px-5 py-3.5 text-right">
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(log.id)}
                              disabled={deletingId === log.id}
                              aria-label="Delete call log"
                              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            >
                              {deletingId === log.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Trash2 size={13} />
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
        </div>
      </div>

      {/* Log Call Sheet */}
      <LogCallSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmit={form => logMutation.mutate(form)}
        submitting={logMutation.isPending}
      />
    </>
  );
}
