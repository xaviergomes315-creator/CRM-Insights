import { useState } from 'react';
import { clsx } from 'clsx';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

type LeadStatus = 'New' | 'Contacted' | 'Closed';

interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  New: 'bg-blue-100 text-blue-700 border border-blue-200',
  Contacted: 'bg-amber-100 text-amber-700 border border-amber-200',
  Closed: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const INITIAL_LEADS: Lead[] = [
  { id: 1, name: 'Priya Sharma', email: 'priya@example.com', phone: '+91 98001 11111', status: 'New' },
  { id: 2, name: 'Rahul Mehta', email: 'rahul@example.com', phone: '+91 98001 22222', status: 'Contacted' },
  { id: 3, name: 'Anita Desai', email: 'anita@example.com', phone: '+91 98001 33333', status: 'Closed' },
  { id: 4, name: 'Vikram Nair', email: 'vikram@example.com', phone: '+91 98001 44444', status: 'New' },
  { id: 5, name: 'Sunita Patel', email: 'sunita@example.com', phone: '+91 98001 55555', status: 'Contacted' },
];

const EMPTY_FORM = { name: '', email: '', phone: '', status: 'New' as LeadStatus };

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<typeof EMPTY_FORM>>({});

  const openAddModal = () => {
    setEditingLead(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setForm({ name: lead.name, email: lead.email, phone: lead.phone, status: lead.status });
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingLead(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const validate = () => {
    const e: Partial<typeof EMPTY_FORM> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
    if (!form.phone.trim()) e.phone = 'Phone is required';
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }

    if (editingLead) {
      setLeads(prev => prev.map(l => l.id === editingLead.id ? { ...l, ...form } : l));
    } else {
      const newId = Math.max(0, ...leads.map(l => l.id)) + 1;
      setLeads(prev => [...prev, { id: newId, ...form }]);
    }
    closeModal();
  };

  const handleDelete = (id: number) => {
    setLeads(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM Leads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} total
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

      {/* Table card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Name</th>
              <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Email</th>
              <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Phone</th>
              <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Status</th>
              <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground tracking-wide text-xs uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground text-sm">
                  No leads yet. Click &ldquo;Add New Lead&rdquo; to get started.
                </td>
              </tr>
            ) : (
              leads.map((lead, idx) => (
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
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Dialog */}
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
