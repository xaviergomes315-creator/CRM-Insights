import { useState } from 'react';
import { clsx } from 'clsx';
import { Plus, Pencil, Trash2, X, Filter, AlertCircle, MessageCircle } from 'lucide-react';
import { useLeads, type LeadSource, type LeadStatus, type Lead, isIdleLead } from '@/contexts/LeadsContext';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useAuth, maskPhone } from '@/contexts/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<LeadStatus, string> = {
  New:              'bg-blue-100 text-blue-700 border border-blue-200',
  Interested:       'bg-amber-100 text-amber-700 border border-amber-200',
  'Demo Scheduled': 'bg-violet-100 text-violet-700 border border-violet-200',
  Closed:           'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const SOURCE_STYLES: Record<LeadSource, string> = {
  WhatsApp:      'bg-green-100 text-green-700 border border-green-200',
  Website:       'bg-purple-100 text-purple-700 border border-purple-200',
  IndiaMart:     'bg-orange-100 text-orange-700 border border-orange-200',
  JustDial:      'bg-cyan-100 text-cyan-700 border border-cyan-200',
  'Social Media':'bg-pink-100 text-pink-700 border border-pink-200',
};

const LEAD_SOURCES: LeadSource[] = ['WhatsApp', 'Website', 'IndiaMart', 'JustDial', 'Social Media'];

// ─── Form type ────────────────────────────────────────────────────────────────

type LeadForm = { name: string; email: string; phone: string; status: LeadStatus; source: LeadSource | '' };
type LeadFormErrors = Partial<Record<keyof LeadForm, string>>;
const EMPTY_FORM: LeadForm = { name: '', email: '', phone: '', status: 'New', source: '' };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { leads, addLead, updateLead, deleteLead } = useLeads();
  const { isTelecaller } = useAuth();
  const { sendDrip } = useWhatsApp();

  const [modalOpen, setModalOpen]       = useState(false);
  const [editingLead, setEditingLead]   = useState<Lead | null>(null);
  const [form, setForm]                 = useState<LeadForm>(EMPTY_FORM);
  const [errors, setErrors]             = useState<LeadFormErrors>({});
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'All'>('All');

  const filteredLeads = sourceFilter === 'All'
    ? leads
    : leads.filter(l => l.source === sourceFilter);

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

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = () => {
    const e: LeadFormErrors = {};
    if (!form.name.trim())  e.name   = 'Name is required';
    if (!form.email.trim()) e.email  = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
    if (!form.phone.trim()) e.phone  = 'Phone is required';
    if (!form.source)       e.source = 'Lead source is required';
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (editingLead) {
      updateLead(editingLead.id, {
        name:   form.name.trim(),
        email:  form.email.trim(),
        phone:  form.phone.trim(),
        source: form.source as LeadSource,
        status: form.status,
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
            {filteredLeads.length} of {leads.length} lead{leads.length !== 1 ? 's' : ''}
            {sourceFilter !== 'All' && (
              <span className="ml-1">· filtered by <strong>{sourceFilter}</strong></span>
            )}
          </p>
        </div>
        {/* Add button — hidden for Telecaller (data entry is an Admin-only action) */}
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

      {/* Telecaller data-protection notice */}
      {isTelecaller && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <strong>Data Protection Active:</strong> Phone numbers are masked and export features are disabled for your role.
          </span>
        </div>
      )}

      {/* Table — horizontally scrollable on mobile */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Name</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Email</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Phone</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Source</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Status</th>
                <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground tracking-wide text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    {sourceFilter !== 'All'
                      ? `No leads found from "${sourceFilter}".`
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
                      {/* Name + Urgent Follow-up badge */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div>
                          <span className="font-medium text-foreground">{lead.name}</span>
                          {idle && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-600 border border-red-200">
                              <AlertCircle className="h-3 w-3 flex-shrink-0" />
                              Urgent Follow-up
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{lead.email}</td>

                      {/* Phone — masked for Telecaller */}
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap font-mono text-xs">
                        {isTelecaller ? maskPhone(lead.phone) : lead.phone}
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

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {/* Send Drip — shown for idle leads (all roles can send messages) */}
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
                                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[36px]"
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

      {/* Add / Edit Modal */}
      {modalOpen && !isTelecaller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {editingLead ? 'Edit Lead' : 'Add New Lead'}
                </h2>
                {!editingLead && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Automation: status will be set to <strong className="text-foreground ml-0.5">New</strong>
                  </p>
                )}
              </div>
              <button
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form — scrollable */}
            <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Priya Sharma"
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.name ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="e.g. priya@example.com"
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.email ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Phone Number <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="e.g. +91 98001 12345"
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.phone ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
                </div>

                {/* Lead Source */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Lead Source <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value as LeadSource }))}
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.source ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  >
                    <option value="" disabled>Select source…</option>
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.source && <p className="mt-1 text-xs text-destructive">{errors.source}</p>}
                </div>

                {/* Status — only shown when editing */}
                {editingLead && (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value as LeadStatus }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="New">New</option>
                      <option value="Interested">Interested</option>
                      <option value="Demo Scheduled">Demo Scheduled</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl flex-shrink-0">
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full sm:w-auto rounded-lg border border-border bg-background px-4 py-3 sm:py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto rounded-lg bg-primary px-4 py-3 sm:py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  {editingLead ? 'Save Changes' : 'Add Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
