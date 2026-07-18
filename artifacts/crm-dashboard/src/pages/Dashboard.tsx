import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Clock, CheckCircle2, CalendarDays, Phone, ArrowRight,
  Users, TrendingUp, FileText, Kanban, ShieldCheck, ShieldAlert,
  Trophy, Medal,
} from 'lucide-react';
import { useLeads, TELECALLER_POOL } from '@/contexts/LeadsContext';
import { useTasks, type Task } from '@/contexts/TasksContext';
import { useAuth, ALL_USERS } from '@/contexts/AuthContext';

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
  <Trophy className="h-4 w-4 text-amber-500"  />,   // 1st
  <Medal  className="h-4 w-4 text-slate-400"  />,   // 2nd
  <Medal  className="h-4 w-4 text-orange-400" />,   // 3rd
];

function Leaderboard() {
  const { leads } = useLeads();

  // Build stats for every telecaller in the pool
  const rows = TELECALLER_POOL.map(tc => {
    const user        = ALL_USERS.find(u => u.id === tc.id);
    const assigned    = leads.filter(l => l.assignedTo === tc.id);
    const closed      = assigned.filter(l => l.status === 'Closed').length;
    const interested  = assigned.filter(l => l.status === 'Interested' || l.status === 'Demo Scheduled').length;
    const rate        = assigned.length > 0 ? Math.round((closed / assigned.length) * 100) : 0;
    return { id: tc.id, name: user?.name ?? tc.name, assigned: assigned.length, closed, interested, rate };
  }).sort((a, b) => b.closed - a.closed || b.rate - a.rate);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-foreground">Telecaller Leaderboard</h2>
        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 font-semibold px-2 py-0.5 rounded-full">
          Admin View
        </span>
      </div>

      {/* Table */}
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
                {/* Rank */}
                <td className="px-5 py-4 text-center">
                  {rank < 3
                    ? <span className="flex justify-center">{RANK_ICONS[rank]}</span>
                    : <span className="text-xs text-muted-foreground font-semibold">{rank + 1}</span>
                  }
                </td>

                {/* Name */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                      {row.name.charAt(0)}
                    </div>
                    <span className="font-semibold text-foreground text-sm">{row.name}</span>
                  </div>
                </td>

                {/* Assigned */}
                <td className="px-5 py-4 text-center">
                  <span className="text-sm font-semibold text-foreground tabular-nums">{row.assigned}</span>
                </td>

                {/* In progress */}
                <td className="px-5 py-4 text-center">
                  <span className="text-sm font-semibold text-violet-600 tabular-nums">{row.interested}</span>
                </td>

                {/* Closed */}
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

                {/* Conversion rate bar */}
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
                  No telecallers in the system yet.
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { leads } = useLeads();
  const { tasks } = useTasks();
  const navigate = useNavigate();
  const { user, isAdmin, isTelecaller } = useAuth();

  // Telecallers only see their own leads in their stats too
  const myLeads      = isAdmin ? leads : leads.filter(l => l.assignedTo === user?.id);
  const totalLeads   = myLeads.length;
  const newLeads     = myLeads.filter(l => l.status === 'New').length;
  const closedLeads  = myLeads.filter(l => l.status === 'Closed').length;
  const overdueTasks = tasks.filter(t => getTaskStatus(t) === 'overdue').length;

  return (
    <div className="space-y-6">

      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {user?.name ?? 'User'} 👋
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
          {user?.role} Account
        </div>
      </div>

      {/* Role notices */}
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

      {/* Stats */}
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

      {/* Leaderboard — Admin only */}
      {isAdmin && <Leaderboard />}

      {/* Today's Tasks widget */}
      <TodaysTasks />

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction label="Pipeline View"  sub="Manage leads on Kanban board" icon={Kanban}      color="bg-violet-50 text-violet-600"  onClick={() => navigate('/pipeline')}  />
          <QuickAction label="New Proposal"   sub="Build & share a proposal"     icon={FileText}    color="bg-blue-50 text-blue-600"      onClick={() => navigate('/proposals')} />
          <QuickAction label="Add Follow-up"  sub="Schedule a call reminder"     icon={CalendarDays} color="bg-emerald-50 text-emerald-600" onClick={() => navigate('/tasks')}     />
        </div>
      </div>
    </div>
  );
}
