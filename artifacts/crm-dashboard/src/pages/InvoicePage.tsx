import { useState } from 'react';
import { clsx } from 'clsx';
import { Plus, Download, FileText, X, Receipt } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type InvoiceStatus = 'Paid' | 'Pending';

interface Invoice {
  id: number;
  invoiceNumber: string;
  client: string;
  amount: number;
  date: string;       // ISO date
  status: InvoiceStatus;
}

interface InvoiceForm {
  client: string;
  amount: string;
  date: string;
  status: InvoiceStatus;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  Paid:    'bg-emerald-100 text-emerald-700 border border-emerald-200',
  Pending: 'bg-amber-100  text-amber-700  border border-amber-200',
};

const INITIAL_INVOICES: Invoice[] = [
  { id: 1, invoiceNumber: 'INV-1001', client: 'Priya Sharma',  amount: 25000, date: '2026-07-01', status: 'Paid' },
  { id: 2, invoiceNumber: 'INV-1002', client: 'Rahul Mehta',   amount: 42500, date: '2026-07-05', status: 'Pending' },
  { id: 3, invoiceNumber: 'INV-1003', client: 'Anita Desai',   amount: 18750, date: '2026-07-08', status: 'Paid' },
  { id: 4, invoiceNumber: 'INV-1004', client: 'Vikram Nair',   amount: 63000, date: '2026-07-12', status: 'Pending' },
  { id: 5, invoiceNumber: 'INV-1005', client: 'Sunita Patel',  amount: 31200, date: '2026-07-15', status: 'Paid' },
];

const EMPTY_FORM: InvoiceForm = { client: '', amount: '', date: '', status: 'Pending' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function generateInvoiceNumber(invoices: Invoice[]) {
  const max = Math.max(1000, ...invoices.map(i => parseInt(i.invoiceNumber.replace('INV-', ''), 10)));
  return `INV-${max + 1}`;
}

// ─── PDF Download ─────────────────────────────────────────────────────────────

function downloadInvoicePdf(invoice: Invoice) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; padding: 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f2d5e; padding-bottom: 24px; margin-bottom: 32px; }
    .brand { font-size: 22px; font-weight: 700; color: #0f2d5e; }
    .brand small { display: block; font-size: 12px; font-weight: 400; color: #64748b; margin-top: 2px; }
    .inv-meta { text-align: right; }
    .inv-meta h2 { font-size: 28px; font-weight: 800; color: #0f2d5e; letter-spacing: -0.5px; }
    .inv-meta p { font-size: 13px; color: #64748b; margin-top: 4px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 8px; }
    .bill-to { margin-bottom: 32px; }
    .bill-to .name { font-size: 16px; font-weight: 600; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    thead tr { background: #0f2d5e; color: #fff; }
    thead th { padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    tbody tr { border-bottom: 1px solid #e2e8f0; }
    tbody td { padding: 12px 14px; font-size: 14px; color: #374151; }
    .total-row { background: #f8fafc; }
    .total-row td { font-weight: 700; font-size: 15px; color: #0f2d5e; }
    .status-badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
      background: ${invoice.status === 'Paid' ? '#d1fae5' : '#fef3c7'};
      color: ${invoice.status === 'Paid' ? '#065f46' : '#92400e'};
      border: 1px solid ${invoice.status === 'Paid' ? '#a7f3d0' : '#fde68a'};
    }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">CRM Pro<small>Business Suite</small></div>
    <div class="inv-meta">
      <h2>${invoice.invoiceNumber}</h2>
      <p>Date: ${formatDate(invoice.date)}</p>
      <p style="margin-top:6px"><span class="status-badge">${invoice.status}</span></p>
    </div>
  </div>

  <div class="bill-to">
    <div class="section-title">Bill To</div>
    <div class="name">${invoice.client}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>Professional Services</td>
        <td style="text-align:right">${formatCurrency(invoice.amount)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="2" style="text-align:right">Total</td>
        <td style="text-align:right">${formatCurrency(invoice.amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">Thank you for your business · CRM Pro Business Suite</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${invoice.invoiceNumber}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ invoices }: { invoices: Invoice[] }) {
  const total   = invoices.reduce((s, i) => s + i.amount, 0);
  const paid    = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + i.amount, 0);
  const pending = invoices.filter(i => i.status === 'Pending').reduce((s, i) => s + i.amount, 0);

  const cards = [
    { label: 'Total Invoices', value: invoices.length.toString(), sub: 'All time', color: 'text-primary' },
    { label: 'Total Revenue',  value: formatCurrency(total),     sub: 'Across all invoices', color: 'text-primary' },
    { label: 'Amount Paid',    value: formatCurrency(paid),      sub: `${invoices.filter(i => i.status === 'Paid').length} invoices`, color: 'text-emerald-600' },
    { label: 'Amount Pending', value: formatCurrency(pending),   sub: `${invoices.filter(i => i.status === 'Pending').length} invoices`, color: 'text-amber-600' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="rounded-xl border border-border bg-card shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{c.label}</p>
          <p className={clsx('text-xl font-bold', c.color)}>{c.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm]           = useState<InvoiceForm>(EMPTY_FORM);
  const [errors, setErrors]       = useState<Partial<InvoiceForm>>({});

  const openModal = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const validate = (): Partial<InvoiceForm> => {
    const e: Partial<InvoiceForm> = {};
    if (!form.client.trim())               e.client = 'Client name is required';
    if (!form.amount.trim())               e.amount = 'Amount is required';
    else if (isNaN(Number(form.amount)) || Number(form.amount) <= 0)
                                           e.amount = 'Enter a valid amount';
    if (!form.date)                        e.date   = 'Date is required';
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const newInvoice: Invoice = {
      id:            Math.max(0, ...invoices.map(i => i.id)) + 1,
      invoiceNumber: generateInvoiceNumber(invoices),
      client:        form.client.trim(),
      amount:        Number(form.amount),
      date:          form.date,
      status:        form.status,
    };
    setInvoices(prev => [newInvoice, ...prev]);
    closeModal();
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Generate Invoice
        </button>
      </div>

      {/* Summary cards */}
      <SummaryCards invoices={invoices} />

      {/* Invoices table */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          All Invoices
        </h2>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Invoice #</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Client</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Date</th>
                <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground tracking-wide text-xs uppercase">Amount</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Status</th>
                <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground tracking-wide text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    No invoices yet. Click &ldquo;Generate Invoice&rdquo; to create one.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice, idx) => (
                  <tr
                    key={invoice.id}
                    className={clsx(
                      'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                      idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                    )}
                  >
                    {/* Invoice number */}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-primary">
                        <FileText className="h-3.5 w-3.5" />
                        {invoice.invoiceNumber}
                      </span>
                    </td>

                    {/* Client */}
                    <td className="px-5 py-4 font-medium text-foreground">{invoice.client}</td>

                    {/* Date */}
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(invoice.date)}</td>

                    {/* Amount */}
                    <td className="px-5 py-4 text-right font-semibold text-foreground tabular-nums">
                      {formatCurrency(invoice.amount)}
                    </td>

                    {/* Status badge */}
                    <td className="px-5 py-4">
                      <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLES[invoice.status])}>
                        {invoice.status}
                      </span>
                    </td>

                    {/* Download action */}
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <button
                          onClick={() => downloadInvoicePdf(invoice)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          <Download className="h-3 w-3" />
                          Download PDF
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

      {/* Generate Invoice Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Generate Invoice</h2>
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

                {/* Client */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Client Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.client}
                    onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                    placeholder="e.g. Priya Sharma"
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.client ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.client && <p className="mt-1 text-xs text-destructive">{errors.client}</p>}
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Amount (₹) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="e.g. 25000"
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                      errors.amount ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.amount && <p className="mt-1 text-xs text-destructive">{errors.amount}</p>}
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Invoice Date <span className="text-destructive">*</span>
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

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as InvoiceStatus }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
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
                  Generate Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
