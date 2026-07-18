import { useState } from 'react';
import { clsx } from 'clsx';
import {
  Plus, Pencil, Trash2, X, Filter, AlertCircle, MessageCircle, Sparkles, Loader2, Copy, Check,
} from 'lucide-react';
import { useLeads, type LeadSource, type LeadStatus, type Lead, isIdleLead, TELECALLER_POOL } from '@/contexts/LeadsContext';
import { useAuth, maskPhone } from '@/contexts/AuthContext';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useToast } from '@/hooks/use-toast';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_STYLES: Record<LeadSource, string> = {
  WhatsApp:      'bg-green-100 text-green-700 border border-green-200',
  Website:       'bg-blue-100 text-blue-700 border border-blue-200',
  IndiaMart:     'bg-orange-100 text-orange-700 border border-orange-200',
  JustDial:      'bg-yellow-100 text-yellow-700 border border-yellow-200',
  'Social Media':'bg-purple-100 text-purple-700 border border-purple-200',
};

const STATUS_STYLES: Record<LeadStatus, string> = {
  'New':            'bg-blue-100 text-blue-700',
  'Interested':     'bg-amber-100 text-amber-700',
  'Demo Scheduled': 'bg-violet-100 text-violet-700',
  'Closed':         'bg-emerald-100 text-emerald-700',
};

const LEAD_SOURCES: LeadSource[] = ['WhatsApp', 'Website', 'IndiaMart', 'JustDial', 'Social Media'];
const LEAD_STATUSES: LeadStatus[] = ['New', 'Interested', 'Demo Scheduled', 'Closed'];

// ─── Lead form types ──────────────────────────────────────────────────────────

interface LeadForm {
  name:   string;
  email:  string;
  phone:  string;
  status: LeadStatus;
  source: string;
}

type LeadFormErrors = Partial<Record<keyof LeadForm, string>>;
const EMPTY_FORM: LeadForm = { name: '', email: '', phone: '', status: 'New', source: '' };

// ─── AI Draft helpers ─────────────────────────────────────────────────────────

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

// ─── AI Draft Modal ───────────────────────────────────────────────────────────

function AiDraftModal({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const [status,  setStatus]  = useState<'loading' | 'ready'>('loading');
  const [message, setMessage] = useState('');
  const [copied,  setCopied]  = useState(false);
  const { toast } = useToast();

  // Simulate 1-second AI generation delay
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
    toast({
      title: '✅ Opening WhatsApp',
      description: `AI-drafted message ready for ${lead.name}.`,
    });
    onClose();
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-violet-50 to-blue-50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-bold text-foreground">AI Smart Drafter</span>
            <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 font-semibold px-2 py-0.5 rounded-full">
              Beta
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Lead context chip */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{lead.name}</span>
            <span>·</span>
            <span>{lead.source}</span>
            <span>·</span>
            <span className={clsx('rounded-full px-2 py-0.5 font-semibold', STATUS_STYLES[lead.status])}>
              {lead.status}
            </span>
          </div>

          {/* Loading / Ready */}
          {status === 'loading' ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Drafting personalised message…</p>
              <div className="flex gap-1 mt-1">
                {[0, 150, 300].map(d => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Sparkles className="h-3 w-3 text-violet-500" />
                  AI-Generated Draft
                  <span className="text-muted-foreground font-normal">(you can edit before sending)</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={9}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/40 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleSendWA}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5d] transition-colors min-h-[40px]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send via WhatsApp
                </button>
                <button
                  onClick={handleCopy}
                  className={clsx(
                    'flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all min-h-[40px]',
                    copied
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-background border-border text-foreground hover:bg-muted',
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { leads, addLead, updateLead, deleteLead } = useLeads();
  const { user, isTelecaller, isAdmin } = useAuth();
  const { sendDrip } = useWhatsApp();

  const [modalOpen, setModalOpen]       = useState(false);
  const [editingLead, setEditingLead]   = useState<Lead | null>(null);
  const [form, setForm]                 = useState<LeadForm>(EMPTY_FORM);
  const [errors, setErrors]             = useState<LeadFormErrors>({});
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'All'>('All');
  const [draftLead, setDraftLead]       = useState<Lead | null>(null);

  // ── Role-based data isolation ───────────────────────────────────────────────
  // Telecaller: only their assigned leads. Admin: all leads.
  const myLeads = isAdmin
    ? leads
    : leads.filter(l => l.assignedTo === user?.id);

  // Source filter applied on top of role-isolation
  const filteredLeads = sourceFilter === 'All'
    ? myLeads
    : myLeads.filter(l => l.source === sourceFilter);

  // ── Assigned-to display helper ──────────────────────────────────────────────
  const telecallerName = (id: string) =>
    TELECALLER_POOL.find(t => t.id === id)?.name ?? '—';

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingLead(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setForm({ name: lead.name, email: lead.email, phone: lead.phone, status: lead.status, source: lead.source });
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingLead(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  // ── Validation ──────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: LeadFormErrors = {};
    if (!form.name.trim())   e.name   = 'Name is required';
    if (!form.phone.trim())  e.phone  = 'Phone is required';
    if (!form.source)        e.source = 'Source is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (editingLead) {
      updateLead(editingLead.id, {
        name:   form.name.trim(),
        email:  form.email.trim(),
        phone:  form.phone.trim(),
        status: form.status,
        source: form.source as LeadSource,
      });
    } else {
      addLead({
        name:   form.name.trim(),
        email:  form.email.trim(),
        phone:  form.phone.trim(),
        source: form.source as LeadSource,
      });
    }
    closeModal();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM Leads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {filteredLeads.length} of {myLeads.length} lead{myLeads.length !== 1 ? 's' : ''}
            {isTelecaller && (
              <span className="ml-1 text-amber-600 font-medium">· assigned to you</span>
            )}
            {sourceFilter !== 'All' && (
              <span className="ml-1">· filtered by <strong>{sourceFilter}</strong></span>
            )}
          </p>
        </div>
        {!isTelecaller && (
          <button
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity min-h-[44px] sm:min-h-0 sm:py-2.5"
          >
            <Plus className="h-4 w-4" />
            Add New Lead
          </button>
        )}
      </div>

      {/* Source filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">Source:</span>
        {(['All', ...LEAD_SOURCES] as const).map(src => (
          <button
            key={src}
            onClick={() => setSourceFilter(src)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors min-h-[36px]',
              sourceFilter === src
                ? 'bg-primary text-primary-foreground border-primary'
                : src === 'All'
                  ? 'bg-background text-muted-foreground border-border hover:border-primary hover:text-primary'
                  : clsx('bg-background border-border hover:border-primary hover:text-primary', SOURCE_STYLES[src as LeadSource]),
            )}
          >
            {src}
          </button>
        ))}
      </div>

      {/* Data-protection notice for Telecaller */}
      {isTelecaller && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <strong>Data Isolation Active:</strong> You see only leads assigned to you. Phone numbers are masked.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Name</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Email</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Phone</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Source</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Status</th>
                {/* Assigned column — Admin only */}
                {isAdmin && (
                  <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Assigned To</th>
                )}
                <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground tracking-wide text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    {sourceFilter !== 'All'
                      ? `No leads found from "${sourceFilter}".`
                      : isTelecaller
                        ? 'No leads are currently assigned to you.'
                        : 'No leads yet. Click "Add New Lead" to get started.'}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead, idx) => {
                  const idle = isIdleLead(lead);
                  return (
                    <tr
                      key={lead.id}
                      className={clsx(
                        'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                        idle ? 'bg-red-50/40' : idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                      )}
                    >
                      {/* Name */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{lead.name}</span>
                          {idle && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 text-xs font-semibold">
                              <AlertCircle className="h-2.5 w-2.5" /> Idle
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                        {lead.email || '—'}
                      </td>

                      {/* Phone */}
                      <td className="px-5 py-4 whitespace-nowrap font-mono text-xs">
                        <a
                          href={`tel:${lead.phone}`}
                          className="text-primary hover:underline"
                          title={isTelecaller ? 'Click to call' : lead.phone}
                        >
                          {isTelecaller ? maskPhone(lead.phone) : lead.phone}
                        </a>
                      </td>

                      {/* Source */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', SOURCE_STYLES[lead.source])}>
                          {lead.source}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLES[lead.status])}>
                          {lead.status}
                        </span>
                      </td>

                      {/* Assigned To — Admin only */}
                      {isAdmin && (
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                              {telecallerName(lead.assignedTo).charAt(0)}
                            </span>
                            {telecallerName(lead.assignedTo)}
                          </div>
                        </td>
                      )}

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2 flex-wrap">

                          {/* AI Draft — all roles */}
                          <button
                            onClick={() => setDraftLead(lead)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors min-h-[36px] whitespace-nowrap"
                          >
                            <Sparkles className="h-3 w-3" />
                            AI Draft
                          </button>

                          {/* Send Drip — idle leads only */}
                          {idle && (
                            <button
                              onClick={() => sendDrip(lead)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 px-3 py-2 text-xs font-medium text-[#128C7E] hover:bg-[#25D366]/20 transition-colors min-h-[36px] whitespace-nowrap"
                            >
                              <MessageCircle className="h-3 w-3" />
                              Send Drip
                            </button>
                          )}

                          {/* Edit / Delete — Admin only */}
                          {!isTelecaller && (
                            <>
                              <button
                                onClick={() => openEditModal(lead)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors min-h-[36px]"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                onClick={() => deleteLead(lead.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors min-h-[36px]"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── AI Draft Modal ───────────────────────────────────────────────────── */}
      {draftLead && (
        <AiDraftModal
          lead={draftLead}
          onClose={() => setDraftLead(null)}
        />
      )}

      {/* ── Add / Edit Lead Modal ────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground">
                {editingLead ? 'Edit Lead' : 'Add New Lead'}
              </h2>
              <button onClick={closeModal} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Priya Sharma"
                  className={clsx('w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40', errors.name ? 'border-red-400 bg-red-50' : 'border-border bg-background')}
                />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="priya@example.com"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Phone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98001 XXXXX"
                  className={clsx('w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40', errors.phone ? 'border-red-400 bg-red-50' : 'border-border bg-background')}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Source *</label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  className={clsx('w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40', errors.source ? 'border-red-400 bg-red-50' : 'border-border bg-background')}
                >
                  <option value="">Select source…</option>
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.source && <p className="mt-1 text-xs text-red-600">{errors.source}</p>}
              </div>

              {/* Status — edit only */}
              {editingLead && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as LeadStatus }))}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Auto-assign note */}
              {!editingLead && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/40 rounded-lg px-3 py-2">
                  <Sparkles className="h-3 w-3 text-primary flex-shrink-0" />
                  This lead will be automatically assigned to a telecaller via round-robin.
                </p>
              )}

              {/* Footer */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  {editingLead ? 'Save Changes' : 'Add Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
