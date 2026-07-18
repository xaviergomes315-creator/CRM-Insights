import { DndContext, type DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Phone, AlertCircle, MessageCircle, Sparkles, Loader2, X, Copy, Check } from 'lucide-react';
import { useLeads, type Lead, type LeadStatus, isIdleLead, TELECALLER_POOL } from '@/contexts/LeadsContext';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useAuth, maskPhone } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: LeadStatus[] = ['New', 'Interested', 'Demo Scheduled', 'Closed'];

const COLUMN_CONFIG: Record<LeadStatus, { header: string; dot: string; empty: string }> = {
  New:             { header: 'bg-blue-50 border-blue-200',      dot: 'bg-blue-500',    empty: 'text-blue-300'    },
  Interested:      { header: 'bg-amber-50 border-amber-200',    dot: 'bg-amber-500',   empty: 'text-amber-300'   },
  'Demo Scheduled':{ header: 'bg-violet-50 border-violet-200',  dot: 'bg-violet-500',  empty: 'text-violet-300'  },
  Closed:          { header: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', empty: 'text-emerald-300' },
};

// ─── AI Draft helpers ─────────────────────────────────────────────────────────

type LeadSource = Lead['source'];

const SOURCE_INTEREST: Record<LeadSource, string> = {
  'IndiaMart':    'bulk procurement or B2B solutions',
  'WhatsApp':     'our offerings',
  'Website':      'our services',
  'JustDial':     'local business solutions',
  'Social Media': 'our latest products',
};

const STATUS_CONTEXT: Record<LeadStatus, string> = {
  'New':            "you've recently reached out to us",
  'Interested':     "you've shown strong interest in moving forward",
  'Demo Scheduled': "you have a demo with us coming up",
  'Closed':         "you've previously worked with us",
};

function generateAiDraft(lead: Lead): string {
  return [
    `Hi ${lead.name}! 👋`,
    ``,
    `I noticed ${STATUS_CONTEXT[lead.status]} regarding ${SOURCE_INTEREST[lead.source]}.`,
    ``,
    `Our team has helped many clients with similar needs achieve great results — and I'd love to understand your specific requirements better so I can personalise a solution just for you. 🎯`,
    ``,
    `Could we set up a quick 10-minute call this week? Just reply "Yes" here and I'll send you a calendar link right away!`,
    ``,
    `Looking forward to connecting!`,
    `— CRM Pro Team`,
  ].join('\n');
}

// ─── AI Draft Mini-Modal ──────────────────────────────────────────────────────

function AiDraftModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [status,  setStatus]  = useState<'loading' | 'ready'>('loading');
  const [message, setMessage] = useState('');
  const [copied,  setCopied]  = useState(false);
  const { toast } = useToast();

  useState(() => {
    const t = setTimeout(() => {
      setMessage(generateAiDraft(lead));
      setStatus('ready');
    }, 1000);
    return () => clearTimeout(t);
  });

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(message); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWA = () => {
    const phone = lead.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    toast({ title: '✅ Opening WhatsApp', description: `AI-drafted message ready for ${lead.name}.` });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-violet-50 to-blue-50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-bold text-foreground">AI Smart Drafter</span>
            <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 font-semibold px-2 py-0.5 rounded-full">Beta</span>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{lead.name}</span>
            <span>·</span>
            <span>{lead.source}</span>
          </div>

          {status === 'loading' ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Drafting personalised message…</p>
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={9}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/40 resize-none"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleSendWA}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5d] transition-colors"
                >
                  <MessageCircle className="h-4 w-4" /> Send via WhatsApp
                </button>
                <button
                  onClick={handleCopy}
                  className={clsx(
                    'flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all',
                    copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-background border-border text-foreground hover:bg-muted',
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Draggable Kanban card ────────────────────────────────────────────────────

function KanbanCard({ lead }: { lead: Lead }) {
  const { isTelecaller, isAdmin } = useAuth();
  const { sendDrip } = useWhatsApp();
  const [draftOpen, setDraftOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const style  = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const idle   = isIdleLead(lead);
  const tcName = TELECALLER_POOL.find(t => t.id === lead.assignedTo)?.name ?? '—';

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={clsx(
          'border rounded-lg p-3 shadow-sm touch-none',
          'cursor-grab active:cursor-grabbing select-none',
          'transition-shadow hover:shadow-md',
          idle ? 'bg-red-50 border-red-200' : 'bg-card border-border',
          isDragging && 'opacity-40 shadow-xl ring-2 ring-primary/30',
        )}
      >
        {/* Name + idle badge */}
        <div className="mb-1">
          <p className="font-semibold text-sm text-foreground leading-tight">{lead.name}</p>
          {idle && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-600 border border-red-200">
              <AlertCircle className="h-2.5 w-2.5 flex-shrink-0" />
              Urgent Follow-up
            </div>
          )}
        </div>

        <span className="inline-block text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {lead.source}
        </span>

        {/* Assigned to — Admin only */}
        {isAdmin && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold flex-shrink-0">
              {tcName.charAt(0)}
            </span>
            {tcName}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-2 pt-2 border-t border-border space-y-1.5">
          {/* Call */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => window.open(`tel:${lead.phone}`)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors min-h-[28px] w-full"
          >
            <Phone className="h-3 w-3 flex-shrink-0" />
            <span>{isTelecaller ? maskPhone(lead.phone) : `Call ${lead.phone}`}</span>
          </button>

          {/* AI Draft */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setDraftOpen(true); }}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-md px-2 py-1 transition-colors min-h-[28px] w-full"
          >
            <Sparkles className="h-3 w-3 flex-shrink-0" />
            AI Draft Reply
          </button>

          {/* Send Drip — idle only */}
          {idle && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); sendDrip(lead); }}
              className="flex items-center gap-1.5 text-xs font-medium text-[#128C7E] bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 rounded-md px-2 py-1 transition-colors min-h-[28px] w-full"
            >
              <MessageCircle className="h-3 w-3 flex-shrink-0" />
              Send Drip Message
            </button>
          )}
        </div>
      </div>

      {/* AI Draft modal — portal outside the draggable div */}
      {draftOpen && <AiDraftModal lead={lead} onClose={() => setDraftOpen(false)} />}
    </>
  );
}

// ─── Droppable column ─────────────────────────────────────────────────────────

function KanbanColumn({ status, leads }: { status: LeadStatus; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg         = COLUMN_CONFIG[status];
  const urgentCount = leads.filter(isIdleLead).length;

  return (
    <div className="flex-shrink-0 w-72">
      {/* Column header */}
      <div className={clsx('flex items-center justify-between rounded-t-xl border px-4 py-3', cfg.header)}>
        <div className="flex items-center gap-2">
          <span className={clsx('h-2 w-2 rounded-full', cfg.dot)} />
          <span className="text-sm font-semibold text-foreground">{status}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {urgentCount > 0 && (
            <span className="rounded-full bg-red-100 text-red-600 border border-red-200 text-xs font-bold px-1.5 py-0.5">
              {urgentCount} urgent
            </span>
          )}
          <span className="rounded-full bg-background/80 border border-border text-xs font-semibold px-2 py-0.5">
            {leads.length}
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={clsx(
          'min-h-[200px] rounded-b-xl border-x border-b border-border p-2 space-y-2 transition-colors',
          isOver ? 'bg-primary/5 border-primary/30' : 'bg-muted/20',
        )}
      >
        {leads.length === 0 ? (
          <div className={clsx('flex flex-col items-center justify-center h-24 text-xs', cfg.empty)}>
            <span>Drop leads here</span>
          </div>
        ) : (
          leads.map(lead => <KanbanCard key={lead.id} lead={lead} />)
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PipelineView() {
  const { leads, updateLead } = useLeads();
  const { user, isAdmin, isTelecaller } = useAuth();

  // ── Role-based data isolation ─────────────────────────────────────────────
  const visibleLeads = isAdmin
    ? leads
    : leads.filter(l => l.assignedTo === user?.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const leadId    = active.id as number;
    const newStatus = over.id as LeadStatus;
    if (COLUMNS.includes(newStatus)) {
      updateLead(leadId, { status: newStatus });
    }
  };

  const totalUrgent = visibleLeads.filter(isIdleLead).length;

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag lead cards between stages to update their pipeline status.
          {isTelecaller && <span className="ml-1 text-amber-600 font-medium">· Showing your assigned leads only.</span>}
        </p>
      </div>

      {/* Urgent alert banner */}
      {totalUrgent > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong>{totalUrgent} lead{totalUrgent > 1 ? 's' : ''}</strong>{' '}
            ha{totalUrgent > 1 ? 've' : 's'} been idle for 48+ hours.
            Use <strong>Send Drip Message</strong> to re-engage them via WhatsApp.
          </span>
        </div>
      )}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {COLUMNS.map(col => {
          const count  = visibleLeads.filter(l => l.status === col).length;
          const urgent = visibleLeads.filter(l => l.status === col && isIdleLead(l)).length;
          const cfg    = COLUMN_CONFIG[col];
          return (
            <div key={col} className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium', cfg.header)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
              {col}: {count}
              {urgent > 0 && <span className="ml-1 text-red-600 font-semibold">({urgent} urgent)</span>}
            </div>
          );
        })}
      </div>

      {/* Kanban board */}
      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col}
              status={col}
              leads={visibleLeads.filter(l => l.status === col)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
