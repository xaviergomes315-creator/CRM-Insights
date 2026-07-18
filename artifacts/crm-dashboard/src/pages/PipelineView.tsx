import { DndContext, type DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { Phone, AlertCircle, MessageCircle } from 'lucide-react';
import { useLeads, type Lead, type LeadStatus, isIdleLead, getDripWhatsAppUrl } from '@/contexts/LeadsContext';
import { useUser, maskPhone } from '@/contexts/UserContext';

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: LeadStatus[] = ['New', 'Interested', 'Demo Scheduled', 'Closed'];

const COLUMN_CONFIG: Record<LeadStatus, { header: string; dot: string; empty: string }> = {
  New:             { header: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500',    empty: 'text-blue-300'    },
  Interested:      { header: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-500',   empty: 'text-amber-300'   },
  'Demo Scheduled':{ header: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500',  empty: 'text-violet-300'  },
  Closed:          { header: 'bg-emerald-50 border-emerald-200',dot:'bg-emerald-500',  empty: 'text-emerald-300' },
};

// ─── Draggable card ───────────────────────────────────────────────────────────

function KanbanCard({ lead }: { lead: Lead }) {
  const { isTelecaller } = useUser();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const idle  = isIdleLead(lead);

  return (
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

      {/* Action buttons */}
      <div className="mt-2 pt-2 border-t border-border space-y-1.5">
        {/* Call — uses real number in tel: link; display is masked for Telecaller */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => window.open(`tel:${lead.phone}`)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors min-h-[28px] w-full"
        >
          <Phone className="h-3 w-3 flex-shrink-0" />
          <span>
            {isTelecaller ? maskPhone(lead.phone) : `Call ${lead.phone}`}
          </span>
        </button>

        {/* Send Drip — visible for idle leads regardless of role */}
        {idle && (
          <a
            href={getDripWhatsAppUrl(lead)}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs font-medium text-[#128C7E] bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 rounded-md px-2 py-1 transition-colors min-h-[28px] w-full"
          >
            <MessageCircle className="h-3 w-3 flex-shrink-0" />
            Send Drip Message
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Droppable column ─────────────────────────────────────────────────────────

function KanbanColumn({ status, leads }: { status: LeadStatus; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg = COLUMN_CONFIG[status];
  const urgentCount = leads.filter(isIdleLead).length;

  return (
    <div className="flex flex-col min-w-[240px] w-full sm:w-64 flex-shrink-0">
      {/* Column header */}
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2.5 rounded-t-xl border',
          cfg.header,
        )}
      >
        <span className={clsx('h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} />
        <span className="text-sm font-semibold text-foreground flex-1">{status}</span>
        <span className="text-xs text-muted-foreground bg-white/70 px-2 py-0.5 rounded-full font-medium">
          {leads.length}
        </span>
        {urgentCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs font-semibold text-red-600 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded-full">
            <AlertCircle className="h-2.5 w-2.5" />{urgentCount}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={clsx(
          'flex flex-col gap-2 flex-1 min-h-[260px] rounded-b-xl p-2 transition-colors duration-150',
          isOver
            ? 'bg-primary/5 border-2 border-dashed border-primary/40'
            : 'bg-muted/30 border-2 border-transparent',
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const leadId   = active.id as number;
    const newStatus = over.id as LeadStatus;
    if (COLUMNS.includes(newStatus)) {
      updateLead(leadId, { status: newStatus });
    }
  };

  const totalUrgent = leads.filter(isIdleLead).length;

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag lead cards between stages to update their pipeline status.
        </p>
      </div>

      {/* Urgent alert banner */}
      {totalUrgent > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong>{totalUrgent} lead{totalUrgent > 1 ? 's' : ''}</strong> ha{totalUrgent > 1 ? 've' : 's'} been idle for 48+ hours.
            Use <strong>Send Drip Message</strong> to re-engage them via WhatsApp.
          </span>
        </div>
      )}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {COLUMNS.map(col => {
          const count   = leads.filter(l => l.status === col).length;
          const urgent  = leads.filter(l => l.status === col && isIdleLead(l)).length;
          const cfg     = COLUMN_CONFIG[col];
          return (
            <div key={col} className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium', cfg.header)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
              {col}: {count}
              {urgent > 0 && (
                <span className="ml-1 text-red-600 font-semibold">({urgent} urgent)</span>
              )}
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
              leads={leads.filter(l => l.status === col)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
