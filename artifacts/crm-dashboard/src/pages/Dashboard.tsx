import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Clock, CheckCircle2, CalendarDays, Phone, ArrowRight,
  Users, TrendingUp, FileText, Kanban, ShieldCheck, ShieldAlert,
  Trophy, Medal, UserCheck, Briefcase, DollarSign, Activity,
  TrendingDown, FileCheck,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useLeads, TELECALLER_POOL } from '@/contexts/LeadsContext';
import { useTasks, type Task } from '@/contexts/TasksContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DbMetrics {
  totalLeads:      number;
  activeEmployees: number;
  totalInvoices:   number;
  totalRevenue:    number;
}

interface LeadStatusBar {
  status: string;
  count:  number;
}

interface MonthRevenue {
  month:   string;
  revenue: number;
}

interface ActivityItem {
  id:    string;
  type:  'lead' | 'invoice' | 'attendance';
  label: string;
  sub:   string;
  time:  string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getTaskStatus(task: Task): 'overdue' | 'today' | 'upcoming' | 'done' {
  if (task.done) return 'done';
  const today = todayStr();
  if (task.followUpDate < today) return 'overdue';
  if (task.followUpDate === today) {
    const nowTime = new Date().toTimeString().slice(0, 5);
    if (task.followUpTime && task.followUpTime < nowTime) return 'overdue';
    return 'today';
  }
  return 'upcoming';
}

function fmtTime(timeStr: string) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtCurrency(n: number) {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${MONTH_ABBR[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

// ─── Status colour map for bar chart ─────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  New:             '#6366f1',
  Interested:      '#8b5cf6',
  'Demo Scheduled':'#3b82f6',
  Closed:          '#10b981',
  'Not Interested':'#ef4444',
  'Follow-up':     '#f59e0b',
};
function statusColor(s: string) {
  return STATUS_COLORS[s] ?? '#94a3b8';
}

// ─── Data fetch hook ──────────────────────────────────────────────────────────

function useDashboardData() {
  const [metrics,    setMetrics]    = useState<DbMetrics | null>(null);
  const [leadsBars,  setLeadsBars]  = useState<LeadStatusBar[]>([]);
  const [revLine,    setRevLine]    = useState<MonthRevenue[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading,    setLoading]    = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);

    // ── 1. Parallel counts ──────────────────────────────────────────────────
    const [leadsRes, empRes, invRes] = await Promise.all([
      supabase.from('leads')     .select('id, status, created_at, name'),
      supabase.from('employees') .select('id, created_at, full_name'),
      supabase.from('invoices')  .select('id, amount, status, created_at, client_name, invoice_number'),
    ]);

    // ── 2. Metrics ──────────────────────────────────────────────────────────
    const allLeads    = (leadsRes.data    ?? []) as { id:string; status:string; created_at:string; name?:string }[];
    const allEmps     = (empRes.data      ?? []) as { id:string; created_at:string; full_name:string }[];
    const allInvoices = (invRes.data      ?? []) as { id:string; amount:number; status:string; created_at:string; client_name:string; invoice_number:string }[];

    const totalRevenue = allInvoices
      .filter(i => i.status === 'Paid')
      .reduce((s, i) => s + Number(i.amount), 0);

    setMetrics({
      totalLeads:      allLeads.length,
      activeEmployees: allEmps.length,
      totalInvoices:   allInvoices.length,
      totalRevenue,
    });

    // ── 3. Leads by status (bar chart) ──────────────────────────────────────
    const statusCount: Record<string, number> = {};
    for (const l of allLeads) {
      statusCount[l.status] = (statusCount[l.status] ?? 0) + 1;
    }
    setLeadsBars(
      Object.entries(statusCount)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    );

    // ── 4. Monthly revenue — last 6 months (line chart) ─────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const revenueByMonth: Record<string, number> = {};
    // Pre-fill last 6 months so months with no data still show
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      revenueByMonth[monthKey(d.toISOString())] = 0;
    }
    for (const inv of allInvoices) {
      if (inv.status === 'Paid' && new Date(inv.created_at) >= sixMonthsAgo) {
        const mk = monthKey(inv.created_at);
        revenueByMonth[mk] = (revenueByMonth[mk] ?? 0) + Number(inv.amount);
      }
    }
    setRevLine(Object.entries(revenueByMonth).map(([month, revenue]) => ({ month, revenue })));

    // ── 5. Recent activities (last 5 across 3 tables) ───────────────────────
    const [attRes] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, created_at, status, employees(full_name)')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    type AttRow = { id: string; created_at: string; status: string; employees: { full_name: string }[] | null };
    const attRows = (attRes.data ?? []) as unknown as AttRow[];

    const feed: ActivityItem[] = [
      ...allLeads
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
        .map(l => ({
          id:    `lead-${l.id}`,
          type:  'lead' as const,
          label: l.name ? `New lead: ${l.name}` : 'New lead added',
          sub:   l.status ?? '',
          time:  l.created_at,
        })),
      ...allInvoices
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
        .map(i => ({
          id:    `inv-${i.id}`,
          type:  'invoice' as const,
          label: `Invoice ${i.invoice_number}`,
          sub:   `${i.client_name} · ${fmtCurrency(Number(i.amount))}`,
          time:  i.created_at,
        })),
      ...attRows.map(a => ({
        id:    `att-${a.id}`,
        type:  'attendance' as const,
        label: `Attendance: ${a.employees?.[0]?.full_name ?? 'Employee'}`,
        sub:   a.status,
        time:  a.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);

    setActivities(feed);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { metrics, leadsBars, revLine, activities, loading, refresh: fetch };
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: number | string; sub: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 flex items-start gap-4">
      <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 flex items-start gap-4 animate-pulse">
      <div className="h-10 w-10 rounded-xl bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-6 w-16 rounded bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
    </div>
  );
}

// ─── Today's Tasks widget ─────────────────────────────────────────────────────

function TodaysTasks() {
  const { tasks } = useTasks();
  const navigate = useNavigate();

  const todayTasks = tasks.filter(t => {
    const s = getTaskStatus(t);
    return s === 'today' || s === 'overdue';
  }).sort((a, b) => {
    const sa = getTaskStatus(a);
    const sb = getTaskStatus(b);
    if (sa === 'overdue' && sb !== 'overdue') return -1;
    if (sa !== 'overdue' && sb === 'overdue') return 1;
    return a.followUpTime.localeCompare(b.followUpTime);
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Today's Tasks</h2>
          {todayTasks.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
              {todayTasks.length}
            </span>
          )}
        </div>
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
        >
          View all <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="divide-y divide-border">
        {todayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No tasks due today. You're all caught up!</p>
          </div>
        ) : (
          todayTasks.map(task => {
            const status    = getTaskStatus(task);
            const isOverdue = status === 'overdue';
            return (
              <div
                key={task.id}
                className={clsx(
                  'flex items-center gap-3 px-5 py-3.5',
                  isOverdue ? 'bg-amber-50' : 'bg-card',
                )}
              >
                {isOverdue
                  ? <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  : <Clock       className="h-4 w-4 text-blue-500  flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {task.leadName}
                    </span>
                    {isOverdue && (
                      <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {task.followUpTime ? fmtTime(task.followUpTime) : 'No time set'}
                    {task.note ? ` • ${task.note}` : ''}
                  </p>
                </div>
                <a
                  href={`tel:${task.leadPhone}`}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg px-2.5 py-1.5 transition-colors flex-shrink-0 min-h-[32px]"
                  onClick={e => e.stopPropagation()}
                >
                  <Phone className="h-3 w-3" /> Call
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Telecaller Leaderboard (Admin-only) ──────────────────────────────────────

const RANK_ICONS = [
  <Trophy className="h-4 w-4 text-amber-500"  />,
  <Medal  className="h-4 w-4 text-slate-400"  />,
  <Medal  className="h-4 w-4 text-orange-400" />,
];

function Leaderboard() {
  const { leads } = useLeads();

  const rows = TELECALLER_POOL.map(tc => {
    const assigned   = leads.filter(l => l.assignedTo === tc.id);
    const closed     = assigned.filter(l => l.status === 'Closed').length;
    const interested = assigned.filter(l => l.status === 'Interested' || l.status === 'Demo Scheduled').length;
    const rate       = assigned.length > 0 ? Math.round((closed / assigned.length) * 100) : 0;
    return { id: tc.id, name: tc.name, assigned: assigned.length, closed, interested, rate };
  }).sort((a, b) => b.closed - a.closed || b.rate - a.rate);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-foreground">Telecaller Leaderboard</h2>
        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 font-semibold px-2 py-0.5 rounded-full">
          Admin View
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telecaller</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigned</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">In Progress</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Closed</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conv. Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rank) => (
              <tr
                key={row.id}
                className={clsx(
                  'border-b border-border last:border-0 transition-colors',
                  rank === 0 ? 'bg-amber-50/60' : 'hover:bg-muted/20',
                )}
              >
                <td className="px-5 py-4 text-center">
                  {rank < 3
                    ? <span className="flex justify-center">{RANK_ICONS[rank]}</span>
                    : <span className="text-xs text-muted-foreground font-semibold">{rank + 1}</span>
                  }
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                      {row.name.charAt(0)}
                    </div>
                    <span className="font-semibold text-foreground text-sm">{row.name}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="text-sm font-semibold text-foreground tabular-nums">{row.assigned}</span>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="text-sm font-semibold text-violet-600 tabular-nums">{row.interested}</span>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className={clsx(
                    'inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
                    row.closed > 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    {row.closed}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${row.rate}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">
                      {row.rate}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No employees assigned to leads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Quick action card ────────────────────────────────────────────────────────

function QuickAction({ label, sub, icon: Icon, color, onClick }: {
  label: string; sub: string; icon: React.ElementType; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all text-left w-full group"
    >
      <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto flex-shrink-0 group-hover:text-primary transition-colors" />
    </button>
  );
}

// ─── Activity type config ─────────────────────────────────────────────────────

const ACTIVITY_CONFIG = {
  lead: {
    icon:  Users,
    color: 'bg-blue-50 text-blue-600',
    ring:  'ring-blue-100',
  },
  invoice: {
    icon:  FileCheck,
    color: 'bg-emerald-50 text-emerald-600',
    ring:  'ring-emerald-100',
  },
  attendance: {
    icon:  UserCheck,
    color: 'bg-violet-50 text-violet-600',
    ring:  'ring-violet-100',
  },
};

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, currency = false }: {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const val: number | undefined = typeof payload[0].value === 'number' ? payload[0].value : undefined;
  const display = currency && val != null ? fmtCurrency(val) : (val ?? payload[0].value);
  return (
    <div className="rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-0.5">{label}</p>
      <p className="text-primary font-bold">{display}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { leads } = useLeads();
  const { tasks } = useTasks();
  const navigate = useNavigate();
  const { user, profile, isAdmin, isTelecaller } = useAuth();

  // Local context stats
  const myLeads      = isAdmin ? leads : leads.filter(l => l.assignedTo === user?.id);
  const totalLeads   = myLeads.length;
  const newLeads     = myLeads.filter(l => l.status === 'New').length;
  const closedLeads  = myLeads.filter(l => l.status === 'Closed').length;
  const overdueTasks = tasks.filter(t => getTaskStatus(t) === 'overdue').length;

  const displayName = profile?.full_name || user?.email || 'User';
  const displayRole = profile?.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '';

  // DB analytics data
  const { metrics, leadsBars, revLine, activities, loading } = useDashboardData();

  return (
    <div className="space-y-6">

      {/* ── Welcome ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {displayName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border self-start sm:self-auto',
          isTelecaller
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700',
        )}>
          {isTelecaller
            ? <ShieldAlert className="h-3.5 w-3.5" />
            : <ShieldCheck className="h-3.5 w-3.5" />
          }
          {displayRole} Account
        </div>
      </div>

      {/* ── Role notices ─────────────────────────────────────────────────────── */}
      {isTelecaller && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">
          <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <strong>Data Protection Active:</strong> You see only your assigned leads. Phone numbers are masked and export features are disabled.
          </span>
        </div>
      )}
      {isAdmin && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <strong>Admin Access:</strong> You have full visibility across all telecallers, leads, and export features.
          </span>
        </div>
      )}

      {/* ── DB Metrics ───────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Company Overview
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {loading || !metrics ? (
            [1,2,3,4].map(i => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard
                label="Total Leads"
                value={metrics.totalLeads}
                sub="CRM pipeline"
                icon={Users}
                color="bg-blue-50 text-blue-600"
              />
              <StatCard
                label="Active Employees"
                value={metrics.activeEmployees}
                sub="HR directory"
                icon={Briefcase}
                color="bg-violet-50 text-violet-600"
              />
              <StatCard
                label="Total Invoices"
                value={metrics.totalInvoices}
                sub="Finance records"
                icon={FileText}
                color="bg-amber-50 text-amber-600"
              />
              <StatCard
                label="Revenue Collected"
                value={fmtCurrency(metrics.totalRevenue)}
                sub="Paid invoices"
                icon={DollarSign}
                color="bg-emerald-50 text-emerald-600"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Pipeline stats (context-based, role-scoped) ───────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {isTelecaller ? 'My Pipeline' : 'Pipeline Summary'}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label={isTelecaller ? 'My Leads' : 'Total Leads'}
            value={totalLeads}
            sub={isTelecaller ? 'Assigned to you' : 'All pipeline stages'}
            icon={Users}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="New Leads"
            value={newLeads}
            sub="Awaiting contact"
            icon={TrendingUp}
            color="bg-violet-50 text-violet-600"
          />
          <StatCard
            label="Closed Deals"
            value={closedLeads}
            sub="Conversion wins"
            icon={CheckCircle2}
            color="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            label="Overdue Tasks"
            value={overdueTasks}
            sub={overdueTasks > 0 ? 'Need attention now' : 'All caught up!'}
            icon={AlertCircle}
            color={overdueTasks > 0 ? 'bg-amber-50 text-amber-600' : 'bg-muted text-muted-foreground'}
          />
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Leads by Status — Bar chart */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <TrendingDown className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Leads by Status</h2>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="h-52 flex items-center justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : leadsBars.length === 0 ? (
              <div className="h-52 flex flex-col items-center justify-center text-muted-foreground">
                <Users className="h-8 w-8 opacity-25 mb-2" />
                <p className="text-sm">No leads data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={leadsBars} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={(p) => <ChartTooltip {...p} />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {leadsBars.map((entry) => (
                      <Cell key={entry.status} fill={statusColor(entry.status)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Monthly Revenue — Line chart */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-foreground">Monthly Revenue</h2>
            <span className="ml-auto text-xs text-muted-foreground">Paid invoices · last 6 months</span>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="h-52 flex items-center justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              </div>
            ) : revLine.every(r => r.revenue === 0) ? (
              <div className="h-52 flex flex-col items-center justify-center text-muted-foreground">
                <DollarSign className="h-8 w-8 opacity-25 mb-2" />
                <p className="text-sm">No paid invoices yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={revLine} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={v => fmtCurrency(v)}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip content={<ChartTooltip currency />} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Activities + Leaderboard ──────────────────────────────────── */}
      <div className={clsx('grid gap-4', isAdmin ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>

        {/* Recent Activities feed */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              [1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 rounded bg-muted" />
                    <div className="h-3 w-24 rounded bg-muted" />
                  </div>
                  <div className="h-3 w-10 rounded bg-muted" />
                </div>
              ))
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Activity className="h-8 w-8 opacity-25 mb-2" />
                <p className="text-sm">No recent activity yet</p>
              </div>
            ) : (
              activities.map(item => {
                const cfg  = ACTIVITY_CONFIG[item.type];
                const Icon = cfg.icon;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                    <div className={clsx('flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ring-2', cfg.color, cfg.ring)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                      {item.sub && (
                        <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {timeAgo(item.time)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Leaderboard — Admin only */}
        {isAdmin && <Leaderboard />}
      </div>

      {/* ── Today's Tasks widget ─────────────────────────────────────────────── */}
      <TodaysTasks />

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction label="Pipeline View"  sub="Manage leads on Kanban board" icon={Kanban}       color="bg-violet-50 text-violet-600"  onClick={() => navigate('/pipeline')}  />
          <QuickAction label="New Proposal"   sub="Build & share a proposal"     icon={FileText}    color="bg-blue-50 text-blue-600"      onClick={() => navigate('/proposals')} />
          <QuickAction label="Add Follow-up"  sub="Schedule a call reminder"     icon={CalendarDays} color="bg-emerald-50 text-emerald-600" onClick={() => navigate('/tasks')}     />
        </div>
      </div>
    </div>
  );
}
