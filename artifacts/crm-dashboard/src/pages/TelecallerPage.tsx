import { useState, useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { CalendarDays, Phone, X, ChevronLeft, ChevronRight, Zap, RefreshCw, Bell } from 'lucide-react';
import { useLeads, type LeadSource } from '@/contexts/LeadsContext';
import { useAuth, maskPhone } from '@/contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type CallOutcome = 'Interested' | 'No Answer' | 'Not Interested' | 'Pending';

interface PendingCall {
  id: number;
  clientName: string;
  phone: string;
  lastCalledDate: string;
  outcome: CallOutcome;
  nextCallDate: string | null;
}

interface ScheduleForm { date: string; time: string; notes: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTCOME_STYLES: Record<CallOutcome, string> = {
  Interested:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'No Answer':     'bg-amber-100  text-amber-700  border border-amber-200',
  'Not Interested':'bg-red-100    text-red-700    border border-red-200',
  Pending:         'bg-blue-100   text-blue-700   border border-blue-200',
};

const SOURCE_STYLES: Record<LeadSource, string> = {
  WhatsApp:      'bg-green-100 text-green-700 border border-green-200',
  Website:       'bg-purple-100 text-purple-700 border border-purple-200',
  IndiaMart:     'bg-orange-100 text-orange-700 border border-orange-200',
  JustDial:      'bg-cyan-100 text-cyan-700 border border-cyan-200',
  'Social Media':'bg-pink-100 text-pink-700 border border-pink-200',
};

const INITIAL_CALLS: PendingCall[] = [];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMPTY_FORM: ScheduleForm = { date: '', time: '10:00', notes: '' };
const REFRESH_INTERVAL_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ─── New Lead Alert Toast ─────────────────────────────────────────────────────

interface AlertToastProps {
  count: number;
  latestName: string;
  onClose: () => void;
}

function NewLeadAlertToast({ count, latestName, onClose }: AlertToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-50">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary text-primary-foreground shadow-2xl px-4 py-4 sm:min-w-[300px] sm:max-w-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 flex-shrink-0 mt-0.5">
          <Bell className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {count === 1 ? 'New Lead Arrived!' : `${count} New Leads Arrived!`}
          </p>
          <p className="text-xs opacity-80 mt-0.5 truncate">
            {count === 1
              ? `${latestName} was just added — status set to New automatically.`
              : `Latest: ${latestName} — all statuses set to New automatically.`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 mt-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Follow-up Calendar ───────────────────────────────────────────────────────

function FollowUpCalendar({ calls }: { calls: PendingCall[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const scheduledDates = new Set(calls.filter(c => c.nextCallDate).map(c => c.nextCallDate as string));

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstDay    = new Date(cursor.year, cursor.month, 1).getDay();
  const monthLabel  = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const prev = () => setCursor(c => c.month === 0  ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  const next = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0  } : { year: c.year, month: c.month + 1 });

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Follow-up Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-sm font-medium text-foreground min-w-[120px] sm:min-w-[130px] text-center">{monthLabel}</span>
          <button onClick={next} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => <div key={d} className="py-1.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />;
          const iso     = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = cursor.year === today.getFullYear() && cursor.month === today.getMonth() && day === today.getDate();
          const hasCall = scheduledDates.has(iso);
          return (
            <div key={day} className={clsx('relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
              isToday ? 'bg-primary text-primary-foreground font-bold' : hasCall ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-muted',
            )}>
              {day}
              {hasCall && !isToday && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-4">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary inline-block" /> Today</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary/20 inline-block" /> Scheduled call</span>
      </div>
    </div>
  );
}

// ─── Live Lead Feed ───────────────────────────────────────────────────────────

function LiveLeadFeed() {
  const { leads } = useLeads();
  const { isTelecaller } = useAuth();
  const [tick, setTick]                 = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [secondsUntilNext, setSecondsUntilNext] = useState(REFRESH_INTERVAL_MS / 1000);

  useEffect(() => {
    const refreshTimer = setInterval(() => {
      setIsRefreshing(true);
      setTimeout(() => {
        setTick(t => t + 1);
        setLastRefreshed(Date.now());
        setSecondsUntilNext(REFRESH_INTERVAL_MS / 1000);
        setIsRefreshing(false);
      }, 600);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    const countdown = setInterval(() => {
      setSecondsUntilNext(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(countdown);
  }, [tick]);

  const recentLeads = [...leads]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 8);

  const secsSinceRefresh = Math.floor((Date.now() - lastRefreshed) / 1000);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Zap className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">Live Lead Feed</span>
          <span className="flex items-center gap-1.5 ml-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Live</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className={clsx('h-3 w-3', isRefreshing && 'animate-spin text-primary')} />
          {isRefreshing
            ? <span className="text-primary font-medium">Refreshing…</span>
            : <span>In <strong className="tabular-nums text-foreground">{secondsUntilNext}s</strong></span>
          }
        </div>
        <div className="text-xs text-muted-foreground hidden sm:block border-l border-border pl-3">
          Updated {secsSinceRefresh < 5 ? 'just now' : `${secsSinceRefresh}s ago`}
        </div>
      </div>

      {/* Feed rows */}
      <div className="divide-y divide-border">
        {recentLeads.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          recentLeads.map((lead, idx) => (
            <div
              key={`${lead.id}-${tick}`}
              className={clsx(
                'flex items-center gap-3 px-4 sm:px-5 py-3.5 transition-colors',
                idx === 0 && 'bg-emerald-50/60',
              )}
            >
              {/* Avatar */}
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold uppercase">
                {lead.name.charAt(0)}
              </div>

              {/* Name + phone */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{lead.name}</span>
                  {idx === 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-xs font-bold">
                      <Zap className="h-2.5 w-2.5" /> Latest
                    </span>
                  )}
                </div>
                {/* Display masked for Telecaller; real number stays in tel: links only */}
                <p className="text-xs text-muted-foreground font-mono">
                  {isTelecaller ? maskPhone(lead.phone) : lead.phone}
                </p>
              </div>

              {/* Source badge — hidden on very small screens */}
              <span className={clsx('hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0', SOURCE_STYLES[lead.source])}>
                {lead.source}
              </span>

              {/* Status */}
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 flex-shrink-0">
                New
              </span>

              {/* Time ago */}
              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 hidden xs:block">
                {timeAgo(lead.addedAt)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-5 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
        <span>Showing {recentLeads.length} most recent lead{recentLeads.length !== 1 ? 's' : ''}</span>
        <span className="hidden sm:flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Auto-refresh every 10s</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TelecallerPage() {
  const { newArrivals, dismissArrivals } = useLeads();
  const { isTelecaller } = useAuth();
  const [calls, setCalls]             = useState<PendingCall[]>(INITIAL_CALLS);
  const [scheduling, setScheduling]   = useState<PendingCall | null>(null);
  const [form, setForm]               = useState<ScheduleForm>(EMPTY_FORM);
  const [errors, setErrors]           = useState<Partial<ScheduleForm>>({});

  const [alertVisible, setAlertVisible]   = useState(false);
  const [alertCount, setAlertCount]       = useState(0);
  const [alertLatest, setAlertLatest]     = useState('');
  const prevArrivalCount                  = useRef(0);

  useEffect(() => {
    if (newArrivals.length > prevArrivalCount.current && newArrivals.length > 0) {
      setAlertCount(newArrivals.length);
      setAlertLatest(newArrivals[0].name);
      setAlertVisible(true);
    }
    prevArrivalCount.current = newArrivals.length;
  }, [newArrivals]);

  const handleDismissAlert = useCallback(() => {
    setAlertVisible(false);
    dismissArrivals();
    prevArrivalCount.current = 0;
  }, [dismissArrivals]);

  const handleOutcomeChange = (id: number, outcome: CallOutcome) =>
    setCalls(prev => prev.map(c => c.id === id ? { ...c, outcome } : c));

  const openSchedule = (call: PendingCall) => {
    setScheduling(call);
    setForm({ date: call.nextCallDate ?? '', time: '10:00', notes: '' });
    setErrors({});
  };
  const closeModal = () => { setScheduling(null); setForm(EMPTY_FORM); setErrors({}); };

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
    setCalls(prev => prev.map(c => c.id === scheduling!.id ? { ...c, nextCallDate: form.date } : c));
    closeModal();
  };

  const pendingCount = calls.filter(c => c.outcome === 'Pending' || c.outcome === 'No Answer').length;

  return (
    <div className="space-y-6">
      {/* Alert toast */}
      {alertVisible && (
        <NewLeadAlertToast
          count={alertCount}
          latestName={alertLatest}
          onClose={handleDismissAlert}
        />
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telecaller</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pendingCount} call{pendingCount !== 1 ? 's' : ''} pending follow-up
          </p>
        </div>
        {newArrivals.length > 0 && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            {newArrivals.length} new lead{newArrivals.length !== 1 ? 's' : ''} since you arrived
          </div>
        )}
      </div>

      {/* Live Lead Feed */}
      <LiveLeadFeed />

      {/* Calendar */}
      <FollowUpCalendar calls={calls} />

      {/* Pending Calls table — horizontally scrollable on mobile */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          Pending Calls
        </h2>
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
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
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">No pending calls.</td></tr>
                ) : (
                  calls.map((call, idx) => (
                    <tr key={call.id} className={clsx('border-b border-border last:border-0 transition-colors hover:bg-muted/30', idx % 2 === 0 ? 'bg-card' : 'bg-muted/10')}>
                      <td className="px-5 py-4 font-medium text-foreground whitespace-nowrap">{call.clientName}</td>
                      {/* Phone: masked display for Telecaller; tel: link always uses real number */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <a
                          href={`tel:${call.phone}`}
                          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors font-mono"
                          title={isTelecaller ? 'Click to call' : call.phone}
                        >
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          {isTelecaller ? maskPhone(call.phone) : call.phone}
                        </a>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{formatDate(call.lastCalledDate)}</td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {call.nextCallDate
                          ? <span className="text-primary font-medium">{formatDate(call.nextCallDate)}</span>
                          : <span className="text-muted-foreground/50 italic text-xs">Not scheduled</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', OUTCOME_STYLES[call.outcome])}>
                            {call.outcome}
                          </span>
                          <select
                            value={call.outcome}
                            onChange={e => handleOutcomeChange(call.id, e.target.value as CallOutcome)}
                            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors min-h-[32px]"
                          >
                            <option value="Interested">Interested</option>
                            <option value="No Answer">No Answer</option>
                            <option value="Not Interested">Not Interested</option>
                            <option value="Pending">Pending</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end">
                          <button
                            onClick={() => openSchedule(call)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors whitespace-nowrap min-h-[36px]"
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
      </div>

      {/* Schedule Modal */}
      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">Schedule Next Call</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{scheduling.clientName}</p>
              </div>
              <button onClick={closeModal} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleScheduleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Call Date <span className="text-destructive">*</span></label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className={clsx('w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30', errors.date ? 'border-destructive' : 'border-border focus:border-primary')} />
                  {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Call Time <span className="text-destructive">*</span></label>
                  <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className={clsx('w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30', errors.time ? 'border-destructive' : 'border-border focus:border-primary')} />
                  {errors.time && <p className="mt-1 text-xs text-destructive">{errors.time}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    placeholder="Add any call notes or talking points…"
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none" />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl flex-shrink-0">
                <button type="button" onClick={closeModal} className="w-full sm:w-auto rounded-lg border border-border bg-background px-4 py-3 sm:py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" className="w-full sm:w-auto rounded-lg bg-primary px-4 py-3 sm:py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">Save Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
