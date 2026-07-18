import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { FileText, Printer, Share2, Plus, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceLine {
  id: number;
  description: string;
  qty: number;
  rate: number;
}

interface ProposalData {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  proposalDate: string;
  validUntil: string;
  notes: string;
  services: ServiceLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function fmtDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ─── Proposal Preview (printable) ─────────────────────────────────────────────

function ProposalPreview({ data, printRef }: { data: ProposalData; printRef: React.RefObject<HTMLDivElement | null> }) {
  const subtotal = data.services.reduce((s, l) => s + l.qty * l.rate, 0);
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax;

  return (
    <div ref={printRef} id="proposal-print" className="bg-white rounded-xl border border-border shadow-sm p-8 print:shadow-none print:border-none print:rounded-none print:p-0">
      {/* Company Header */}
      <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-primary">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-primary">CRM Pro</span>
          </div>
          <p className="text-xs text-muted-foreground">Business Suite • solutions@crmpro.in</p>
          <p className="text-xs text-muted-foreground">+91 98000 00000 • www.crmpro.in</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">PROPOSAL</p>
          <p className="text-xs text-muted-foreground mt-1">Date: {fmtDate(data.proposalDate)}</p>
          {data.validUntil && (
            <p className="text-xs text-muted-foreground">Valid until: {fmtDate(data.validUntil)}</p>
          )}
        </div>
      </div>

      {/* Client details */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Prepared for</p>
        <p className="text-lg font-bold text-foreground">{data.clientName || '—'}</p>
        {data.clientEmail && <p className="text-sm text-muted-foreground">{data.clientEmail}</p>}
        {data.clientPhone && <p className="text-sm text-muted-foreground">{data.clientPhone}</p>}
      </div>

      {/* Services table */}
      <table className="w-full mb-6 text-sm">
        <thead>
          <tr className="bg-primary/10">
            <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground rounded-tl-lg">Service / Description</th>
            <th className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground w-16">Qty</th>
            <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground w-28">Rate</th>
            <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground w-28 rounded-tr-lg">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.services.map((line, i) => (
            <tr key={line.id} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/30'}>
              <td className="px-3 py-2.5 text-foreground">{line.description || <span className="text-muted-foreground italic">—</span>}</td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">{line.qty}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{formatINR(line.rate)}</td>
              <td className="px-3 py-2.5 text-right font-medium text-foreground">{formatINR(line.qty * line.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-64 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium text-foreground">{formatINR(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GST (18%)</span>
            <span className="font-medium text-foreground">{formatINR(tax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-2">
            <span className="text-foreground">Total</span>
            <span className="text-primary">{formatINR(total)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div className="border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>CRM Pro • Business Suite</span>
        <span>Thank you for your business!</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProposalPage() {
  const printRef = useRef<HTMLDivElement>(null);
  const [generated, setGenerated] = useState(false);
  const [nextServiceId, setNextServiceId] = useState(2);

  const [form, setForm] = useState<ProposalData>({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    proposalDate: todayStr(),
    validUntil: addDays(todayStr(), 30),
    notes: 'Payment due within 15 days of acceptance. Prices are subject to change after the validity date.',
    services: [{ id: 1, description: '', qty: 1, rate: 0 }],
  });

  // ── Field helpers ──────────────────────────────────────────────────────────

  const setField = <K extends keyof ProposalData>(key: K, val: ProposalData[K]) => {
    setForm(f => ({ ...f, [key]: val }));
  };

  const addService = () => {
    setForm(f => ({
      ...f,
      services: [...f.services, { id: nextServiceId, description: '', qty: 1, rate: 0 }],
    }));
    setNextServiceId(n => n + 1);
  };

  const removeService = (id: number) => {
    setForm(f => ({ ...f, services: f.services.filter(s => s.id !== id) }));
  };

  const updateService = (id: number, key: keyof ServiceLine, value: string | number) => {
    setForm(f => ({
      ...f,
      services: f.services.map(s => s.id === id ? { ...s, [key]: value } : s),
    }));
  };

  // ── Print ──────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const printContent = document.getElementById('proposal-print');
    if (!printContent) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`
      <html><head><title>Proposal – ${form.clientName}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; }
        .border-t { border-top: 1px solid #e5e7eb; }
      </style>
      </head><body>${printContent.innerHTML}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  // ── WhatsApp share ─────────────────────────────────────────────────────────

  const handleWhatsApp = () => {
    const subtotal = form.services.reduce((s, l) => s + l.qty * l.rate, 0);
    const total = Math.round(subtotal * 1.18);
    const msg = [
      `Hello ${form.clientName || 'there'}! 👋`,
      ``,
      `We're pleased to share our proposal for you:`,
      ``,
      `📋 *Services:*`,
      ...form.services
        .filter(s => s.description)
        .map(s => `  • ${s.description} (Qty: ${s.qty}) — ${formatINR(s.qty * s.rate)}`),
      ``,
      `💰 *Total (incl. 18% GST): ${formatINR(total)}*`,
      ``,
      `Valid until: ${fmtDate(form.validUntil)}`,
      ``,
      `Please feel free to reach out for any questions!`,
      `— CRM Pro Team`,
    ].join('\n');
    const phone = form.clientPhone.replace(/\D/g, '');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const subtotal = form.services.reduce((s, l) => s + l.qty * l.rate, 0);
  const total = Math.round(subtotal * 1.18);

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Proposal Builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the details, generate a professional proposal, then print or share via WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Form panel ──────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Client info */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Client Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Client Name *</label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="e.g. Priya Sharma"
                  value={form.clientName}
                  onChange={e => setField('clientName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Client Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="client@example.com"
                  value={form.clientEmail}
                  onChange={e => setField('clientEmail', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Client Phone (for WhatsApp)</label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="+91 98000 00000"
                  value={form.clientPhone}
                  onChange={e => setField('clientPhone', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Proposal Date</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={form.proposalDate}
                  onChange={e => setField('proposalDate', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Valid Until</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={form.validUntil}
                  onChange={e => setField('validUntil', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Services</h2>
              <button
                onClick={addService}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors min-h-[32px] px-2"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>

            {form.services.map((svc, idx) => (
              <div key={svc.id} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="col-span-12 sm:col-span-6 rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Service description"
                  value={svc.description}
                  onChange={e => updateService(svc.id, 'description', e.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  className="col-span-4 sm:col-span-2 rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Qty"
                  value={svc.qty}
                  onChange={e => updateService(svc.id, 'qty', Number(e.target.value))}
                />
                <input
                  type="number"
                  min="0"
                  className="col-span-6 sm:col-span-3 rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Rate (₹)"
                  value={svc.rate || ''}
                  onChange={e => updateService(svc.id, 'rate', Number(e.target.value))}
                />
                <button
                  onClick={() => removeService(svc.id)}
                  disabled={form.services.length === 1}
                  className="col-span-2 sm:col-span-1 flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <div className="flex justify-end pt-2 border-t border-border">
              <div className="text-sm font-semibold text-foreground">
                Total (incl. GST): <span className="text-primary">{formatINR(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Notes</h2>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={() => setGenerated(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-3 text-sm hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            <FileText className="h-4 w-4" />
            Generate Proposal
          </button>
        </div>

        {/* ── Preview panel ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {generated ? (
            <>
              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card text-foreground font-medium px-4 py-2.5 text-sm hover:bg-muted transition-colors min-h-[44px]"
                >
                  <Printer className="h-4 w-4" />
                  Print / Save PDF
                </button>
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center gap-2 rounded-xl bg-[#25D366] text-white font-medium px-4 py-2.5 text-sm hover:bg-[#1ebe5d] transition-colors min-h-[44px]"
                >
                  <Share2 className="h-4 w-4" />
                  Share via WhatsApp
                </button>
              </div>

              {/* Proposal preview */}
              <ProposalPreview data={form} printRef={printRef} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-muted/30 rounded-xl border-2 border-dashed border-border text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Fill the form and click</p>
              <p className="text-sm">"Generate Proposal" to see a preview</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
