import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Clock, CheckCircle2, CalendarDays, Phone, ArrowRight, Users, TrendingUp, FileText, Kanban, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useLeads } from '@/contexts/LeadsContext';
import { useTasks, type Task } from '@/contexts/TasksContext';
import { useAuth } from '@/contexts/AuthContext';

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
    // Overdue first, then by time
    const sa = getTaskStatus(a);
    const sb = getTaskStatus(b);
    if (sa === 'overdue' && sb !== 'overdue') return -1;
    if (sa !== 'overdue' && sb === 'overdue') return 1;
    return a.followUpTime.localeCompare(b.followUpTime);
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
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

      {/* Task list */}
      <div className="divide-y divide-border">
        {todayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No tasks due today. You're all caught up!</p>
          </div>
        ) : (
          todayTasks.map(task => {
            const status = getTaskStatus(task);
            const isOverdue = status === 'overdue';
            return (
              <div
                key={task.id}
                className={clsx(
                  'flex items-center gap-3 px-5 py-3.5',
                  isOverdue ? 'bg-amber-50' : 'bg-card',
                )}
              >
                {/* Icon */}
                {isOverdue ? (
                  <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                )}

                {/* Info */}
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

                {/* Call button */}
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

  const totalLeads   = leads.length;
  const newLeads     = leads.filter(l => l.status === 'New').length;
  const closedLeads  = leads.filter(l => l.status === 'Closed').length;
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
        {/* Role badge */}
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

      {/* Telecaller data-protection notice */}
      {isTelecaller && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">
          <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <strong>Data Protection Active:</strong> Phone numbers are masked and export features are disabled for your role.
          </span>
        </div>
      )}

      {/* Admin notice */}
      {isAdmin && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <strong>Admin Access:</strong> You have full access to all leads, phone numbers, analytics, and export features.
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Leads"    value={totalLeads}   sub="All pipeline stages"    icon={Users}       color="bg-blue-50 text-blue-600"    />
        <StatCard label="New Leads"      value={newLeads}     sub="Awaiting contact"        icon={TrendingUp}  color="bg-violet-50 text-violet-600" />
        <StatCard label="Closed Deals"   value={closedLeads}  sub="Conversion wins"         icon={CheckCircle2}color="bg-emerald-50 text-emerald-600"/>
        <StatCard
          label="Overdue Tasks"
          value={overdueTasks}
          sub={overdueTasks > 0 ? 'Need attention now' : 'All caught up!'}
          icon={AlertCircle}
          color={overdueTasks > 0 ? 'bg-amber-50 text-amber-600' : 'bg-muted text-muted-foreground'}
        />
      </div>

      {/* Today's Tasks widget */}
      <TodaysTasks />

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction label="Pipeline View"    sub="Manage leads on Kanban board" icon={Kanban}     color="bg-violet-50 text-violet-600" onClick={() => navigate('/pipeline')} />
          <QuickAction label="New Proposal"     sub="Build & share a proposal"     icon={FileText}   color="bg-blue-50 text-blue-600"     onClick={() => navigate('/proposals')} />
          <QuickAction label="Add Follow-up"    sub="Schedule a call reminder"     icon={CalendarDays}color="bg-emerald-50 text-emerald-600" onClick={() => navigate('/tasks')} />
        </div>
      </div>
    </div>
  );
}
