import { useState } from 'react';
import { clsx } from 'clsx';
import { Plus, Trash2, CheckCircle2, Clock, AlertCircle, CalendarDays, Loader2 } from 'lucide-react';
import { useLeads } from '@/contexts/LeadsContext';
import { useTasks, type Task } from '@/contexts/TasksContext';
import { useAuth, maskPhone } from '@/contexts/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getTaskStatus(task: Task): 'done' | 'overdue' | 'today' | 'upcoming' {
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

function fmtDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onDone, onDelete, masked = false }: { task: Task; onDone: () => void; onDelete: () => void; masked?: boolean }) {
  const status = getTaskStatus(task);

  const statusBadge = {
    done:     { label: 'Done',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    overdue:  { label: 'Overdue',  cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: AlertCircle  },
    today:    { label: 'Today',    cls: 'bg-blue-100 text-blue-700 border-blue-200',           icon: Clock        },
    upcoming: { label: 'Upcoming', cls: 'bg-muted text-muted-foreground border-border',        icon: CalendarDays },
  }[status];

  const StatusIcon = statusBadge.icon;

  return (
    <div
      className={clsx(
        'flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border transition-colors',
        status === 'overdue' && !task.done
          ? 'bg-amber-50 border-amber-200'
          : 'bg-card border-border',
        task.done && 'opacity-60',
      )}
    >
      {/* Left: status icon */}
      <div className="flex-shrink-0">
        <StatusIcon
          className={clsx(
            'h-5 w-5',
            status === 'done'     && 'text-emerald-500',
            status === 'overdue'  && 'text-amber-500',
            status === 'today'    && 'text-blue-500',
            status === 'upcoming' && 'text-muted-foreground',
          )}
        />
      </div>

      {/* Center: info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className={clsx('text-sm font-semibold', task.done ? 'line-through text-muted-foreground' : 'text-foreground')}>
            {task.leadName}
          </span>
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border', statusBadge.cls)}>
            {statusBadge.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {fmtDate(task.followUpDate)}{task.followUpTime ? ` at ${task.followUpTime}` : ''}
          </span>
          {/* Phone: masked display for Telecaller; actual tel: links use the real number */}
        {task.leadPhone && (
          <a
            href={`tel:${task.leadPhone}`}
            className="flex items-center gap-1 hover:text-primary transition-colors font-mono"
            title={masked ? 'Click to call' : task.leadPhone}
          >
            {masked ? maskPhone(task.leadPhone) : task.leadPhone}
          </a>
        )}
        </div>
        {task.note && (
          <p className="mt-1 text-xs text-muted-foreground italic truncate">{task.note}</p>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {!task.done && (
          <button
            onClick={onDone}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors min-h-[32px]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Done
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'today' | 'overdue' | 'upcoming' | 'done';

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'today',    label: 'Today'    },
  { id: 'overdue',  label: 'Overdue'  },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done',     label: 'Done'     },
];

export default function TasksPage() {
  const { leads } = useLeads();
  const { tasks, addTask, markDone, deleteTask, loading } = useTasks();
  const { isTelecaller } = useAuth();

  const [tab, setTab] = useState<FilterTab>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    leadId: '',
    followUpDate: todayStr(),
    followUpTime: '10:00',
    note: '',
  });

  // ── Form submit ────────────────────────────────────────────────────────────

  const handleAdd = () => {
    if (!form.leadId || !form.followUpDate) return;
    const lead = leads.find(l => l.id === Number(form.leadId));
    if (!lead) return;
    addTask({
      leadId:       lead.id,
      leadName:     lead.name,
      leadPhone:    lead.phone,
      followUpDate: form.followUpDate,
      followUpTime: form.followUpTime,
      note:         form.note,
    });
    setForm({ leadId: '', followUpDate: todayStr(), followUpTime: '10:00', note: '' });
    setShowForm(false);
  };

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = tasks.filter(t => {
    const s = getTaskStatus(t);
    if (tab === 'all')      return true;
    if (tab === 'done')     return s === 'done';
    if (tab === 'overdue')  return s === 'overdue';
    if (tab === 'today')    return s === 'today';
    if (tab === 'upcoming') return s === 'upcoming';
    return true;
  });

  const countOf = (f: FilterTab) =>
    f === 'all' ? tasks.length
    : tasks.filter(t => getTaskStatus(t) === f).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        <p className="text-sm">Loading tasks from database…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks & Reminders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule follow-ups for your leads and track them here.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 text-sm hover:bg-primary/90 transition-colors min-h-[44px] self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* Add task form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Add Follow-up Task</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Lead *</label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={form.leadId}
                onChange={e => setForm(f => ({ ...f, leadId: e.target.value }))}
              >
                <option value="">Select a lead…</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({isTelecaller ? maskPhone(l.phone) : l.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Follow-up Date *</label>
              <input
                type="date"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={form.followUpDate}
                onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Follow-up Time</label>
              <input
                type="time"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={form.followUpTime}
                onChange={e => setForm(f => ({ ...f, followUpTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Note</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="e.g. Discuss pricing, follow up on demo…"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={!form.leadId || !form.followUpDate}
              className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 text-sm hover:bg-primary/90 transition-colors min-h-[44px] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-border bg-background text-foreground font-medium px-4 py-2.5 text-sm hover:bg-muted transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0',
              tab === t.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {countOf(t.id) > 0 && (
              <span className={clsx(
                'text-xs px-1.5 py-0.5 rounded-full',
                tab === t.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                {countOf(t.id)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground bg-muted/20 rounded-xl border-2 border-dashed border-border">
          <CalendarDays className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">
            {tasks.length === 0 ? 'No tasks yet. Add your first follow-up!' : 'No tasks in this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onDone={() => markDone(task.id)}
              onDelete={() => deleteTask(task.id)}
              masked={isTelecaller}
            />
          ))}
        </div>
      )}
    </div>
  );
}
