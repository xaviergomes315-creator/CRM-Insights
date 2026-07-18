import { useState } from 'react';
import { clsx } from 'clsx';
import { Plus, Pencil, Trash2, X, Filter } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type LeadStatus = 'New' | 'Contacted' | 'Closed';
type LeadSource = 'WhatsApp' | 'Website' | 'IndiaMart' | 'JustDial' | 'Social Media';

interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: LeadSource;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<LeadStatus, string> = {
  New:       'bg-blue-100 text-blue-700 border border-blue-200',
  Contacted: 'bg-amber-100 text-amber-700 border border-amber-200',
  Closed:    'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const SOURCE_STYLES: Record<LeadSource, string> = {
  WhatsApp:      'bg-green-100 text-green-700 border border-green-200',
  Website:       'bg-purple-100 text-purple-700 border border-purple-200',
  IndiaMart:     'bg-orange-100 text-orange-700 border border-orange-200',
  JustDial:      'bg-cyan-100 text-cyan-700 border border-cyan-200',
  'Social Media':'bg-pink-100 text-pink-700 border border-pink-200',
};

const LEAD_SOURCES: LeadSource[] = ['WhatsApp', 'Website', 'IndiaMart', 'JustDial', 'Social Media'];

const INITIAL_LEADS: Lead[] = [
  { id: 1, name: 'Priya Sharma',  email: 'priya@example.com',  phone: '+91 98001 11111', status: 'New',       source: 'IndiaMart'    },
  { id: 2, name: 'Rahul Mehta',   email: 'rahul@example.com',  phone: '+91 98001 22222', status: 'Contacted', source: 'WhatsApp'     },
  { id: 3, name: 'Anita Desai',   email: 'anita@example.com',  phone: '+91 98001 33333', status: 'Closed',    source: 'Website'      },
  { id: 4, name: 'Vikram Nair',   email: 'vikram@example.com', phone: '+91 98001 44444', status: 'New',       source: 'JustDial'     },
  { id: 5, name: 'Sunita Patel',  email: 'sunita@example.com', phone: '+91 98001 55555', status: 'Contacted', source: 'Social Media' },
  { id: 6, name: 'Deepak Kumar',  email: 'deepak@example.com', phone: '+91 98001 66666', status: 'New',       source: 'IndiaMart'    },
  { id: 7, name: 'Meena Joshi',   email: 'meena@example.com',  phone: '+91 98001 77777', status: 'Closed',    source: 'Website'      },
  { id: 8, name: 'Arjun Reddy',   email: 'arjun@example.com',  phone: '+91 98001 88888', status: 'New',       source: 'WhatsApp'     },
  { id: 9, name: 'Kavita Singh',  email: 'kavita@example.com', phone: '+91 98001 99999', status: 'Contacted', source: 'Social Media' },
  { id:10, name: 'Rohit Verma',   email: 'rohit@example.com',  phone: '+91 98001 10101', status: 'New',       source: 'JustDial'     },
];

type EmptyForm = { name: string; email: string; phone: string; status: LeadStatus; source: LeadSource | '' };
const EMPTY_FORM: EmptyForm = { name: '', email: '', phone: '', status: 'New', source: '' };

export default function LeadsPage() {
  const [leads, setLeads]         = useState<Lead[]>(INITIAL_LEADS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm]           = useState<EmptyForm>(EMPTY_FORM);
  const [errors, setErrors]       = useState<Partial<EmptyForm>>({});
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
    const e: Partial<EmptyForm> = {};
    if (!form.name.trim())  e.name  = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
    if (!form.phone.trim()) e.phone = 'Phone is required';
    if (!form.source)       e.source = 'Lead source is required';
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (editingLead) {
      setLeads(prev => prev.map(l => l.id === editingLead.id
        ? { ...l, ...form, source: form.source as LeadSource }
        : l,
      ));
    } else {
      const newId = Math.max(0, ...leads.map(l => l.id)) + 1;
      setLeads(prev => [...prev, { id: newId, ...form, source: form.source as LeadSource }]);
    }
    closeModal();
  };

  const handleDelete = (id: number) => setLeads(prev => prev.filter(l => l.id !== id));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM Leads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {filteredLeads.length} of {leads.length} lead{leads.length !== 1 ? 's' : ''}
            {sourceFilter !== 'All' && <span className="ml-1">· filtered by <strong>{sourceFilter}</strong></span>}
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Add New Lead
        </button>
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
              'rounded-full px-3 py-1 text-xs font-semibold border transition-colors',
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

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
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
              filteredLeads.map((lead, idx) => (
                <tr
                  key={lead.id}
                  className={clsx(
                    'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                    idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                  )}
                >
                  <td className="px-5 py-4 font-medium text-foreground">{lead.name}</td>
                  <td className="px-5 py-4 text-muted-foreground">{lead.email}</td>
                  <td className="px-5 py-4 text-muted-foreground">{lead.phone}</td>
                  <td className="px-5 py-4">
                    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', SOURCE_STYLES[lead.source])}>
                      {lead.source}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLES[lead.status])}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(lead)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">
                {editingLead ? 'Edit Lead' : 'Add New Lead'}
              </h2>
              <button
                onClick={closeModal}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="px-6 py-5 space-y-4">

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
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
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
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
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
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.phone ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
                </div>

                {/* Lead Source — mandatory */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Lead Source <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value as LeadSource }))}
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.source ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  >
                    <option value="" disabled>Select source…</option>
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.source && <p className="mt-1 text-xs text-destructive">{errors.source}</p>}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as LeadStatus }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Closed">Closed</option>
                  </select>
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
