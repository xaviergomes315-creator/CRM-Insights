/**
 * Telecaller Dashboard
 *
 * Data sources — no backend changes, everything from existing contexts:
 *   useLeads()  → leads, newArrivals, updateLead
 *   useTasks()  → tasks (= follow-up calls), markDone
 *   useAuth()   → profile, isTelecaller, maskPhone
 *
 * Scoping:
 *   Telecallers (role = 'employee') see only their assigned leads + related tasks.
 *   Admins/managers see all leads and all tasks.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  Phone, CalendarDays, ChevronLeft, ChevronRight,
  Bell, X, Users, Clock, AlertCircle,
  CheckCircle2, Circle, Zap, RefreshCw,
  TrendingUp, ExternalLink,
} from 'lucide-react';
import { useLeads, type LeadSource, type LeadStatus } from '@/contexts/LeadsContext';
import { useTasks, type Task }                         from '@/contexts/TasksContext';
import { useAuth, maskPhone }                          from '@/contexts/AuthContext';

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REFRESH_MS     = 10_000;
const LEAD_STATUSES: LeadStatus[] = ['New', 'Interested', 'Demo Scheduled', 'Closed'];

const STATUS_STYLES: Record<LeadStatus, string> = {
  'New':            'bg-blue-100 text-blue-700 border-blue-200',
  'Interested':     'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Demo Scheduled': 'bg-violet-100 text-violet-700 border-violet-200',
  'Closed':         'bg-gray-100 text-gray-500 border-gray-200',
};

const SOURCE_STYLES: Record<LeadSource, string> = {
  WhatsApp:       'bg-green-100  text-green-700  border-green-200',
  Website:        'bg-purple-100 text-purple-700 border-purple-200',
  IndiaMart:      'bg-orange-100 text-orange-700 border-orange-200',
  JustDial:       'bg-cyan-100   text-cyan-700   border-cyan-200',
  'Social Media': 'bg-pink-100   text-pink-700   border-pink-200',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Summary Card ───────────────────────────────────────────────────────────────

type CardColor = 'blue' | 'emerald' | 'amber' | 'red';

const CARD_COLORS: Record<CardColor, { wrap: string; icon: string; value: string }> = {
  blue:    { wrap: 'bg-blue-50    border-blue-100',    icon: 'bg-blue-100    text-blue-600',    value: 'text-blue-700'    },
  emerald: { wrap: 'bg-emerald-50 border-emerald-100', icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-700' },
  amber:   { wrap: 'bg-amber-50   border-amber-100',   icon: 'bg-amber-100   text-amber-600',   value: 'text-amber-700'   },
  red:     { wrap: 'bg-red-50     border-red-100',     icon: 'bg-red-100     text-red-500',     value: 'text-red-600'     },
};

function SummaryCard({
  label, value, sub, icon: Icon, color, loading,
}: {
  label:    string;
  value:    number;
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
          : <p className={`text-3xl font-bold mt-0.5 tabular-nums ${c.value}`}>{value}</p>
        }
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── New Lead Alert Toast ───────────────────────────────────────────────────────

function NewLeadAlert({
  count, name, onClose,
}: { count: number; name: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-50">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary text-primary-foreground shadow-2xl px-4 py-4 sm:min-w-[300px] sm:max-w-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 flex-shrink-0 mt-0.5">
          <Bell size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {count === 1 ? 'New Lead Assigned!' : `${count} New Leads!`}
          </p>
          <p className="text-xs opacity-80 mt-0.5 truncate">
            {count === 1 ? `${name} was just assigned to you.` : `Latest: ${name}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 mt-0.5"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Today's Calls ──────────────────────────────────────────────────────────────

function TodaysCalls({
  tasks, onMarkDone, loading,
}: {
  tasks:       Task[];
  onMarkDone:  (id: number) => Promise<void>;
  loading:     boolean;
}) {
  const [marking, setMarking] = useState<number | null>(null);
  const { isTelecaller } = useAuth();

  const handleDone = async (id: number) => {
    setMarking(id);
    await onMarkDone(id);
    setMarking(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Phone size={15} className="text-emerald-500" />
          Today's Calls
          {tasks.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
              {tasks.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">{fmtDate(todayStr())}</p>
      </div>

      {loading ? (
        <div className="divide-y divide-border">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-2.5 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <CheckCircle2 size={22} className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-foreground">No calls scheduled for today</p>
          <p className="text-xs text-muted-foreground">Use the Tasks page to add follow-up calls.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {tasks.map(task => (
            <div key={task.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
              {/* Time bubble */}
              <div className="flex-shrink-0 flex flex-col items-center justify-center h-10 w-14 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="text-[11px] font-bold text-emerald-700 leading-tight">{fmtTime(task.followUpTime)}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{task.leadName}</p>
                <a
                  href={`tel:${task.leadPhone}`}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-mono mt-0.5 w-fit"
                >
                  <Phone size={10} />
                  {isTelecaller ? maskPhone(task.leadPhone) : task.leadPhone}
                </a>
                {task.note && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{task.note}</p>
                )}
              </div>

              {/* Mark done */}
              <button
                onClick={() => handleDone(task.id)}
                disabled={marking === task.id}
                className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 px-3 py-2 text-xs font-medium text-foreground transition-colors disabled:opacity-50"
              >
                {marking === task.id ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Circle size={12} />
                )}
                Done
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pending Follow-ups ─────────────────────────────────────────────────────────

function PendingFollowUps({
  upcoming, overdue, onMarkDone, loading,
}: {
  upcoming:   Task[];
  overdue:    Task[];
  onMarkDone: (id: number) => Promise<void>;
  loading:    boolean;
}) {
  const [marking, setMarking] = useState<number | null>(null);
  const { isTelecaller } = useAuth();
  const allTasks = [...overdue, ...upcoming];

  const handleDone = async (id: number) => {
    setMarking(id);
    await onMarkDone(id);
    setMarking(null);
  };

  const isOverdue = (task: Task) => task.followUpDate < todayStr();

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock size={15} className="text-amber-500" />
          Pending Follow-ups
          {overdue.length > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 text-[11px] font-bold">
              <AlertCircle size={10} />
              {overdue.length} overdue
            </span>
          )}
        </h2>
        {allTasks.length > 0 && (
          <span className="text-xs text-muted-foreground">{allTasks.length} total</span>
        )}
      </div>

      {loading ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Lead', 'Phone', 'Date', 'Time', 'Note', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(3)].map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  {[...Array(6)].map((__, j) => (
                    <td key={j} className="px-5 py-3.5">
                      <div className="h-3 w-20 rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : allTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
            <CheckCircle2 size={22} className="text-amber-400" />
          </div>
          <p className="text-sm font-medium text-foreground">No pending follow-ups</p>
          <p className="text-xs text-muted-foreground">Schedule follow-ups from the Tasks page.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lead</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phone</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Time</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {allTasks.map((task, idx) => {
                const overdue = isOverdue(task);
                return (
                  <tr
                    key={task.id}
                    className={clsx(
                      'border-b border-border last:border-0 transition-colors hover:bg-muted/20',
                      overdue ? 'bg-red-50/40' : idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                    )}
                  >
                    <td className="px-5 py-3.5 font-medium text-foreground whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {overdue && (
                          <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                        )}
                        {task.leadName}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <a
                        href={`tel:${task.leadPhone}`}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-mono"
                      >
                        <Phone size={10} />
                        {isTelecaller ? maskPhone(task.leadPhone) : task.leadPhone}
                      </a>
                    </td>
                    <td className={clsx('px-5 py-3.5 whitespace-nowrap text-xs font-medium', overdue ? 'text-red-600' : 'text-foreground')}>
                      {overdue && <AlertCircle size={11} className="inline mr-1 mb-0.5 text-red-500" />}
                      {fmtDate(task.followUpDate)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtTime(task.followUpTime)}
                    </td>
                    <td className="px-5 py-3.5 max-w-[180px]">
                      <p className="text-xs text-muted-foreground truncate">{task.note || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleDone(task.id)}
                        disabled={marking === task.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 px-3 py-1.5 text-xs font-medium text-foreground transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {marking === task.id ? <RefreshCw size={11} className="animate-spin" /> : <Circle size={11} />}
                        Mark Done
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Assigned Leads ─────────────────────────────────────────────────────────────

function AssignedLeads({
  leads, onStatusChange, loading, isTelecaller: isTC,
}: {
  leads:          ReturnType<typeof useLeads>['leads'];
  onStatusChange: (id: number, data: { status: LeadStatus }) => Promise<void>;
  loading:        boolean;
  isTelecaller:   boolean;
}) {
  const [updating, setUpdating] = useState<number | null>(null);

  const handleStatus = async (id: number, status: LeadStatus) => {
    setUpdating(id);
    await onStatusChange(id, { status });
    setUpdating(null);
  };

  // Show most recent leads first, cap at 50 rows
  const displayLeads = useMemo(() =>
    [...leads]
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .slice(0, 50),
  [leads]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users size={15} className="text-blue-500" />
          {isTC ? 'My Assigned Leads' : 'All Leads'}
        </h2>
        {leads.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {displayLeads.length}{leads.length > 50 ? ` of ${leads.length}` : ''} lead{leads.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Name', 'Phone', 'Source', 'Status', 'Last Activity'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-border animate-pulse">
                  {[...Array(5)].map((__, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 w-24 rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
            <Users size={22} className="text-blue-300" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {isTC ? 'No leads assigned to you yet' : 'No leads yet'}
          </p>
          <p className="text-xs text-muted-foreground">New leads will appear here when assigned.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phone</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Source</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {displayLeads.map((lead, idx) => (
                <tr
                  key={lead.id}
                  className={clsx(
                    'border-b border-border last:border-0 transition-colors hover:bg-muted/20',
                    idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                  )}
                >
                  {/* Name */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold uppercase">
                        {lead.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate max-w-[140px]">{lead.name}</p>
                        {lead.email && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">{lead.email}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Phone */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <a
                      href={`tel:${lead.phone}`}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-mono"
                    >
                      <Phone size={10} />
                      {isTC ? maskPhone(lead.phone) : lead.phone}
                    </a>
                  </td>

                  {/* Source */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={clsx(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      SOURCE_STYLES[lead.source] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                    )}>
                      {lead.source}
                    </span>
                  </td>

                  {/* Status — dropdown */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        STATUS_STYLES[lead.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                      )}>
                        {lead.status}
                      </span>
                      <select
                        value={lead.status}
                        onChange={e => handleStatus(lead.id, e.target.value as LeadStatus)}
                        disabled={updating === lead.id}
                        className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-50"
                        aria-label={`Change status for ${lead.name}`}
                      >
                        {LEAD_STATUSES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {updating === lead.id && <RefreshCw size={11} className="animate-spin text-muted-foreground flex-shrink-0" />}
                    </div>
                  </td>

                  {/* Last activity */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {relTime(lead.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Follow-up Calendar ─────────────────────────────────────────────────────────

function FollowUpCalendar({ tasks }: { tasks: Task[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const scheduledDates = useMemo(() =>
    new Set(tasks.filter(t => !t.done).map(t => t.followUpDate)),
  [tasks]);

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstDay    = new Date(cursor.year, cursor.month, 1).getDay();
  const monthLabel  = new Date(cursor.year, cursor.month, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const prev = () => setCursor(c => c.month === 0  ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  const next = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0  } : { year: c.year, month: c.month + 1 });

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays size={15} className="text-primary" />
          Follow-up Calendar
        </h2>
        <div className="flex items-center gap-0.5">
          <button onClick={prev} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="px-2 text-xs font-medium text-foreground min-w-[120px] text-center">{monthLabel}</span>
          <button onClick={next} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="py-1 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />;
          const iso     = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = cursor.year === today.getFullYear() && cursor.month === today.getMonth() && day === today.getDate();
          const hasTask = scheduledDates.has(iso);
          return (
            <div
              key={day}
              className={clsx(
                'relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors',
                isToday   ? 'bg-primary text-primary-foreground font-bold'
                : hasTask ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-foreground hover:bg-muted',
              )}
            >
              {day}
              {hasTask && !isToday && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border pt-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary/25 inline-block" /> Follow-up
        </span>
      </div>
    </div>
  );
}

// ── Live Lead Feed ─────────────────────────────────────────────────────────────

function LiveLeadFeed() {
  const { leads } = useLeads();
  const { isTelecaller: isTC } = useAuth();
  const [tick,               setTick]               = useState(0);
  const [isRefreshing,       setIsRefreshing]        = useState(false);
  const [secondsUntilNext,   setSecondsUntilNext]    = useState(REFRESH_MS / 1000);
  const [lastRefreshedLabel, setLastRefreshedLabel]  = useState('just now');

  useEffect(() => {
    const id = setInterval(() => {
      setIsRefreshing(true);
      setTimeout(() => {
        setTick(t => t + 1);
        setSecondsUntilNext(REFRESH_MS / 1000);
        setLastRefreshedLabel('just now');
        setIsRefreshing(false);
      }, 500);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsUntilNext(s => {
        if (s <= 1) return REFRESH_MS / 1000;
        if (s === 6) setLastRefreshedLabel(`${REFRESH_MS / 1000 - 5}s ago`);
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [tick]);

  const recentLeads = useMemo(() =>
    [...leads].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8),
  [leads]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Zap size={15} className="text-emerald-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">Live Lead Feed</span>
          <span className="flex items-center gap-1.5 ml-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Live</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
          <RefreshCw size={11} className={clsx(isRefreshing && 'animate-spin text-primary')} />
          {isRefreshing
            ? <span className="text-primary font-medium">Refreshing…</span>
            : <span>Next in <strong className="tabular-nums text-foreground">{secondsUntilNext}s</strong></span>
          }
          <span className="hidden sm:block border-l border-border pl-2">{lastRefreshedLabel}</span>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {recentLeads.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          recentLeads.map((lead, idx) => (
            <div
              key={`${lead.id}-${tick}`}
              className={clsx(
                'flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/20',
                idx === 0 && 'bg-emerald-50/50',
              )}
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold uppercase">
                {lead.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{lead.name}</span>
                  {idx === 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold">
                      <Zap size={9} /> Latest
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {isTC ? maskPhone(lead.phone) : lead.phone}
                </p>
              </div>
              <span className={clsx(
                'hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0',
                SOURCE_STYLES[lead.source] ?? 'bg-gray-100 text-gray-600 border-gray-200',
              )}>
                {lead.source}
              </span>
              <span className={clsx(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0',
                STATUS_STYLES[lead.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
              )}>
                {lead.status}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10 text-[11px] text-muted-foreground">
        <span>Showing {recentLeads.length} most recent</span>
        <span className="hidden sm:flex items-center gap-1">
          <RefreshCw size={10} /> Auto-refreshes every {REFRESH_MS / 1000}s
        </span>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TelecallerPage() {
  const { leads, loading: leadsLoading, newArrivals, dismissArrivals, updateLead } = useLeads();
  const { tasks, loading: tasksLoading, markDone } = useTasks();
  const { profile, isTelecaller } = useAuth();

  const today   = useMemo(todayStr, []);
  const loading = leadsLoading || tasksLoading;

  // ── Scope by current user for telecallers ────────────────────────────────────

  const myLeads = useMemo(() =>
    isTelecaller ? leads.filter(l => l.assignedTo === profile?.id) : leads,
  [leads, isTelecaller, profile?.id]);

  const myLeadIdSet = useMemo(() => new Set(myLeads.map(l => l.id)), [myLeads]);

  const myTasks = useMemo(() =>
    isTelecaller ? tasks.filter(t => myLeadIdSet.has(t.leadId)) : tasks,
  [tasks, isTelecaller, myLeadIdSet]);

  // ── Derived counts for summary cards ─────────────────────────────────────────

  const todaysTasks  = useMemo(() =>
    myTasks
      .filter(t => !t.done && t.followUpDate === today)
      .sort((a, b) => a.followUpTime.localeCompare(b.followUpTime)),
  [myTasks, today]);

  const upcomingTasks = useMemo(() =>
    myTasks
      .filter(t => !t.done && t.followUpDate > today)
      .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate) || a.followUpTime.localeCompare(b.followUpTime)),
  [myTasks, today]);

  const overdueTasks  = useMemo(() =>
    myTasks
      .filter(t => !t.done && t.followUpDate < today)
      .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate)),
  [myTasks, today]);

  const newLeadsToday = useMemo(() => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    return myLeads.filter(l => l.addedAt >= startOfDay.getTime()).length;
  }, [myLeads]);

  // ── New arrival alert ─────────────────────────────────────────────────────────

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertCount,   setAlertCount]   = useState(0);
  const [alertLatest,  setAlertLatest]  = useState('');
  const prevCount = useRef(0);

  useEffect(() => {
    if (newArrivals.length > prevCount.current && newArrivals.length > 0) {
      setAlertCount(newArrivals.length);
      setAlertLatest(newArrivals[0].name);
      setAlertVisible(true);
    }
    prevCount.current = newArrivals.length;
  }, [newArrivals]);

  const handleDismissAlert = useCallback(() => {
    setAlertVisible(false);
    dismissArrivals();
    prevCount.current = 0;
  }, [dismissArrivals]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* New lead alert toast */}
      {alertVisible && (
        <NewLeadAlert count={alertCount} name={alertLatest} onClose={handleDismissAlert} />
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Phone size={22} className="text-primary" />
            Telecaller Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isTelecaller
              ? `Welcome back, ${profile?.full_name?.split(' ')[0] ?? 'Telecaller'}`
              : 'All telecaller activity at a glance'}
          </p>
        </div>
        {newArrivals.length > 0 && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            {newArrivals.length} new lead{newArrivals.length !== 1 ? 's' : ''} since login
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="My Leads"
          value={myLeads.length}
          sub={newLeadsToday > 0 ? `${newLeadsToday} added today` : 'total assigned'}
          icon={Users}
          color="blue"
          loading={loading}
        />
        <SummaryCard
          label="Today's Calls"
          value={todaysTasks.length}
          sub="scheduled for today"
          icon={Phone}
          color="emerald"
          loading={loading}
        />
        <SummaryCard
          label="Pending Follow-ups"
          value={upcomingTasks.length}
          sub="upcoming calls"
          icon={Clock}
          color="amber"
          loading={loading}
        />
        <SummaryCard
          label="Overdue"
          value={overdueTasks.length}
          sub={overdueTasks.length === 0 ? 'all clear' : 'need attention'}
          icon={AlertCircle}
          color="red"
          loading={loading}
        />
      </div>

      {/* Today's Calls */}
      <TodaysCalls
        tasks={todaysTasks}
        onMarkDone={markDone}
        loading={loading}
      />

      {/* Pending Follow-ups (upcoming + overdue combined) */}
      <PendingFollowUps
        upcoming={upcomingTasks}
        overdue={overdueTasks}
        onMarkDone={markDone}
        loading={loading}
      />

      {/* Assigned Leads */}
      <AssignedLeads
        leads={myLeads}
        onStatusChange={(id, data) => updateLead(id, data)}
        loading={loading}
        isTelecaller={isTelecaller}
      />

      {/* Bottom row: Live Feed + Calendar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        <LiveLeadFeed />
        <FollowUpCalendar tasks={myTasks} />
      </div>

    </div>
  );
}
