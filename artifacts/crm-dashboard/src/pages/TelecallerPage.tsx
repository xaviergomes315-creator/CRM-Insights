import { useState } from 'react';
import { clsx } from 'clsx';
import { CalendarDays, Phone, X, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type CallOutcome = 'Interested' | 'No Answer' | 'Not Interested' | 'Pending';

interface PendingCall {
  id: number;
  clientName: string;
  phone: string;
  lastCalledDate: string;   // ISO date string
  outcome: CallOutcome;
  nextCallDate: string | null;
}

interface ScheduleForm {
  date: string;
  time: string;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTCOME_STYLES: Record<CallOutcome, string> = {
  Interested:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'No Answer':     'bg-amber-100  text-amber-700  border border-amber-200',
  'Not Interested':'bg-red-100    text-red-700    border border-red-200',
  Pending:         'bg-blue-100   text-blue-700   border border-blue-200',
};

const INITIAL_CALLS: PendingCall[] = [
  { id: 1, clientName: 'Priya Sharma',   phone: '+91 98001 11111', lastCalledDate: '2026-07-14', outcome: 'Interested',       nextCallDate: '2026-07-20' },
  { id: 2, clientName: 'Rahul Mehta',    phone: '+91 98001 22222', lastCalledDate: '2026-07-15', outcome: 'No Answer',        nextCallDate: null },
  { id: 3, clientName: 'Anita Desai',    phone: '+91 98001 33333', lastCalledDate: '2026-07-13', outcome: 'Not Interested',   nextCallDate: null },
  { id: 4, clientName: 'Vikram Nair',    phone: '+91 98001 44444', lastCalledDate: '2026-07-16', outcome: 'Pending',          nextCallDate: '2026-07-18' },
  { id: 5, clientName: 'Sunita Patel',   phone: '+91 98001 55555', lastCalledDate: '2026-07-10', outcome: 'Interested',       nextCallDate: '2026-07-22' },
  { id: 6, clientName: 'Deepak Kumar',   phone: '+91 98001 66666', lastCalledDate: '2026-07-12', outcome: 'No Answer',        nextCallDate: null },
  { id: 7, clientName: 'Meena Joshi',    phone: '+91 98001 77777', lastCalledDate: '2026-07-11', outcome: 'Pending',          nextCallDate: '2026-07-19' },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EMPTY_FORM: ScheduleForm = { date: '', time: '10:00', notes: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function FollowUpCalendar({ calls }: { calls: PendingCall[] }) {
  const today = new Date(2026, 6, 18); // July 18 2026 (matches project "today")
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const scheduledDates = new Set(
    calls
      .filter(c => c.nextCallDate)
      .map(c => c.nextCallDate as string),
  );

  const daysInMonth = getDaysInMonth(cursor.year, cursor.month);
  const firstDay    = getFirstDayOfMonth(cursor.year, cursor.month);
  const monthLabel  = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  });

  const prev = () =>
    setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  const next = () =>
    setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Follow-up Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 text-sm font-medium text-foreground min-w-[130px] text-center">{monthLabel}</span>
          <button
            onClick={next}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="py-1.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;
          const iso = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday    = cursor.year === today.getFullYear() && cursor.month === today.getMonth() && day === today.getDate();
          const hasCall    = scheduledDates.has(iso);
          return (
            <div
              key={day}
              className={clsx(
                'relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                isToday  && 'bg-primary text-primary-foreground font-bold',
                !isToday && hasCall && 'bg-primary/10 text-primary font-semibold',
                !isToday && !hasCall && 'text-foreground hover:bg-muted',
              )}
            >
              {day}
              {hasCall && !isToday && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-4">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-primary inline-block" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-primary/20 inline-block" /> Scheduled call
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TelecallerPage() {
  const [calls, setCalls]           = useState<PendingCall[]>(INITIAL_CALLS);
  const [scheduling, setScheduling] = useState<PendingCall | null>(null);
  const [form, setForm]             = useState<ScheduleForm>(EMPTY_FORM);
  const [errors, setErrors]         = useState<Partial<ScheduleForm>>({});

  // Update outcome inline
  const handleOutcomeChange = (id: number, outcome: CallOutcome) => {
    setCalls(prev => prev.map(c => c.id === id ? { ...c, outcome } : c));
  };

  // Open schedule modal
  const openSchedule = (call: PendingCall) => {
    setScheduling(call);
    setForm({ date: call.nextCallDate ?? '', time: '10:00', notes: '' });
    setErrors({});
  };

  const closeModal = () => {
    setScheduling(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const validate = (): Partial<ScheduleForm> => {
    const e: Partial<ScheduleForm> = {};
    if (!form.date) e.date = 'Please pick a date';
    if (!form.time) e.time = 'Please pick a time';
    return e;
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setCalls(prev =>
      prev.map(c =>
        c.id === scheduling!.id ? { ...c, nextCallDate: form.date } : c,
      ),
    );
    closeModal();
  };

  const pendingCount = calls.filter(c => c.outcome === 'Pending' || c.outcome === 'No Answer').length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telecaller</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pendingCount} call{pendingCount !== 1 ? 's' : ''} pending follow-up
          </p>
        </div>
      </div>

      {/* Calendar */}
      <FollowUpCalendar calls={calls} />

      {/* Pending Calls table */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          Pending Calls
        </h2>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Client Name</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Phone</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Last Called</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Next Call</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Call Outcome</th>
                <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground tracking-wide text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    No pending calls.
                  </td>
                </tr>
              ) : (
                calls.map((call, idx) => (
                  <tr
                    key={call.id}
                    className={clsx(
                      'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                      idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                    )}
                  >
                    {/* Client name */}
                    <td className="px-5 py-4 font-medium text-foreground">{call.clientName}</td>

                    {/* Phone */}
                    <td className="px-5 py-4 text-muted-foreground">{call.phone}</td>

                    {/* Last called */}
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(call.lastCalledDate)}</td>

                    {/* Next call */}
                    <td className="px-5 py-4 text-muted-foreground">
                      {call.nextCallDate ? (
                        <span className="text-primary font-medium">{formatDate(call.nextCallDate)}</span>
                      ) : (
                        <span className="text-muted-foreground/50 italic text-xs">Not scheduled</span>
                      )}
                    </td>

                    {/* Outcome dropdown + badge */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', OUTCOME_STYLES[call.outcome])}>
                          {call.outcome}
                        </span>
                        <select
                          value={call.outcome}
                          onChange={e => handleOutcomeChange(call.id, e.target.value as CallOutcome)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                        >
                          <option value="Interested">Interested</option>
                          <option value="No Answer">No Answer</option>
                          <option value="Not Interested">Not Interested</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>
                    </td>

                    {/* Schedule button */}
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <button
                          onClick={() => openSchedule(call)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                        >
                          <CalendarDays className="h-3 w-3" />
                          Schedule Next Call
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Modal */}
      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-foreground">Schedule Next Call</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{scheduling.clientName}</p>
              </div>
              <button
                onClick={closeModal}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleScheduleSubmit} noValidate>
              <div className="px-6 py-5 space-y-4">
                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Call Date <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.date ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date}</p>}
                </div>

                {/* Time */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Call Time <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.time ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.time && <p className="mt-1 text-xs text-destructive">{errors.time}</p>}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Add any call notes or talking points…"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
