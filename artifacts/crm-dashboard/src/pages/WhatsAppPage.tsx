import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Send, CheckCircle2, Users, MessageSquare, X, CheckCheck, Loader2 } from 'lucide-react';
import { useLeads, type LeadStatus } from '@/contexts/LeadsContext';
import { useAuth, maskPhone } from '@/contexts/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<LeadStatus, string> = {
  New:             'bg-blue-100 text-blue-700 border border-blue-200',
  Interested:      'bg-amber-100 text-amber-700 border border-amber-200',
  'Demo Scheduled':'bg-violet-100 text-violet-700 border border-violet-200',
  Closed:          'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const STATUS_FILTER_OPTIONS: Array<LeadStatus | 'All'> = [
  'All', 'New', 'Interested', 'Demo Scheduled', 'Closed',
];

const MESSAGE_TEMPLATES = [
  { label: 'Follow-up',   text: 'Hi {{name}}, this is a follow-up from CRM Pro. We wanted to check in on your enquiry. Please feel free to reach out to us anytime!' },
  { label: 'Offer',       text: 'Hi {{name}}, we have an exciting offer exclusively for you. Contact us today to learn more about our services.' },
  { label: 'Appointment', text: 'Hi {{name}}, your appointment is confirmed. Please reach out if you need to reschedule. Looking forward to speaking with you!' },
  { label: 'Thank You',   text: 'Hi {{name}}, thank you for your time! It was a pleasure speaking with you. We look forward to working with you.' },
];

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps { count: number; onClose: () => void; }

function SuccessToast({ count, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white shadow-lg px-5 py-4 min-w-[300px]">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 flex-shrink-0 mt-0.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Messages Sent!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            WhatsApp message dispatched to {count} contact{count !== 1 ? 's' : ''} successfully.
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Sent Log ─────────────────────────────────────────────────────────────────

interface SentEntry {
  id: number;
  names: string[];
  count: number;
  preview: string;
  sentAt: Date;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const { leads, loading } = useLeads();
  const { isTelecaller } = useAuth();

  const [selected, setSelected]         = useState<Set<number>>(new Set());
  const [message, setMessage]           = useState('');
  const [sending, setSending]           = useState(false);
  const [toast, setToast]               = useState<{ count: number } | null>(null);
  const [sentLog, setSentLog]           = useState<SentEntry[]>([]);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'All'>('All');

  const filteredLeads = filterStatus === 'All'
    ? leads
    : leads.filter(l => l.status === filterStatus);

  const allFilteredSelected = filteredLeads.length > 0 && filteredLeads.every(l => selected.has(l.id));
  const someSelected        = selected.size > 0;
  const charCount           = message.trim().length;
  const canSend             = someSelected && charCount > 0;

  const toggleLead = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filteredLeads.forEach(l => next.delete(l.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filteredLeads.forEach(l => next.add(l.id));
        return next;
      });
    }
  };

  const applyTemplate = (text: string) => setMessage(text);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);

    await new Promise(r => setTimeout(r, 1200));

    const sentLeads = leads.filter(l => selected.has(l.id));
    const entry: SentEntry = {
      id:      Date.now(),
      names:   sentLeads.map(l => l.name),
      count:   sentLeads.length,
      preview: message.trim().slice(0, 80) + (message.trim().length > 80 ? '…' : ''),
      sentAt:  new Date(),
    };
    setSentLog(prev => [entry, ...prev]);
    setToast({ count: sentLeads.length });
    setSelected(new Set());
    setMessage('');
    setSending(false);
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp Messaging</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Send bulk messages to your leads via WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left: Lead selector ── */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Select Leads</span>
              {someSelected && (
                <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                  {selected.size} selected
                </span>
              )}
            </div>
            {/* Status filter */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as LeadStatus | 'All')}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            >
              {STATUS_FILTER_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Select all row */}
          <div className="px-5 py-3 border-b border-border bg-muted/10 flex items-center gap-3">
            <input
              type="checkbox"
              id="select-all"
              checked={allFilteredSelected}
              onChange={toggleAll}
              disabled={filteredLeads.length === 0}
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:cursor-not-allowed"
            />
            <label htmlFor="select-all" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none">
              Select all ({filteredLeads.length})
            </label>
          </div>

          {/* Lead list */}
          <div className="flex-1 overflow-y-auto divide-y divide-border min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading leads…
              </div>
            ) : filteredLeads.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {leads.length === 0 ? 'No leads in the database yet.' : 'No leads match this filter.'}
              </p>
            ) : (
              filteredLeads.map(lead => {
                const checked = selected.has(lead.id);
                return (
                  <label
                    key={lead.id}
                    htmlFor={`lead-${lead.id}`}
                    className={clsx(
                      'flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors select-none',
                      checked ? 'bg-primary/5' : 'hover:bg-muted/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      id={`lead-${lead.id}`}
                      checked={checked}
                      onChange={() => toggleLead(lead.id)}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                      {/* Phone: masked for Telecaller role */}
                      <p className="text-xs text-muted-foreground font-mono">
                        {isTelecaller ? maskPhone(lead.phone) : lead.phone}
                      </p>
                    </div>
                    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0', STATUS_STYLES[lead.status])}>
                      {lead.status}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Message composer ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Templates */}
          <div className="rounded-xl border border-border bg-card shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Quick Templates</p>
            <div className="flex flex-wrap gap-2">
              {MESSAGE_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t.text)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Compose */}
          <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Message Content</p>
            </div>

            <div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                placeholder={`Type your WhatsApp message here…\n\nTip: Use {{name}} to personalise with the lead's name.`}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-muted-foreground">
                  {charCount === 0 ? 'No message entered.' : `${charCount} character${charCount !== 1 ? 's' : ''}`}
                </p>
                {charCount > 160 && (
                  <p className="text-xs text-amber-600">Long message — may be split into multiple parts.</p>
                )}
              </div>
            </div>

            {/* Recipient summary */}
            <div className={clsx(
              'rounded-lg border px-4 py-3 text-sm transition-colors',
              someSelected
                ? 'border-primary/30 bg-primary/5 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground',
            )}>
              {someSelected
                ? `Ready to send to ${selected.size} lead${selected.size !== 1 ? 's' : ''}.`
                : 'Select at least one lead from the list to send a message.'}
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!canSend || sending}
              className={clsx(
                'w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all',
                canSend && !sending
                  ? 'bg-[#25D366] text-white hover:bg-[#1ebe5d] shadow-sm'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {sending ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send WhatsApp Message
                </>
              )}
            </button>
          </div>

          {/* Sent log */}
          {sentLog.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                <CheckCheck className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-foreground">Sent Messages</p>
                <span className="ml-auto text-xs text-muted-foreground">{sentLog.length} batch{sentLog.length !== 1 ? 'es' : ''}</span>
              </div>
              <div className="divide-y divide-border">
                {sentLog.map(entry => (
                  <div key={entry.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground mb-0.5">
                          {entry.count} recipient{entry.count !== 1 ? 's' : ''} · {entry.names.slice(0, 3).join(', ')}{entry.names.length > 3 ? ` +${entry.names.length - 3} more` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground italic truncate">&ldquo;{entry.preview}&rdquo;</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-xs text-muted-foreground">{formatTime(entry.sentAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <SuccessToast count={toast.count} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
