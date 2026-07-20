import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import {
  FileText, Download, Mail, Share2, Plus, Trash2, Save, Loader2, FilePlus,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CompanyRow, ProposalStatus } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const GST_RATE = 0.18;

const STATUS_OPTIONS: ProposalStatus[] = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];

const STATUS_STYLES: Record<ProposalStatus, string> = {
  Draft:    'bg-muted text-muted-foreground',
  Sent:     'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Accepted: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  Expired:  'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
};

// ─── Local Types ──────────────────────────────────────────────────────────────

/** Minimal row shown in the saved-proposals list */
interface ProposalSummary {
  id:              string;
  proposal_number: string;
  client_name:     string;
  status:          ProposalStatus;
  total:           number;
  created_at:      string;
}

/** A single line item as held in form state */
interface ServiceLine {
  /** Ephemeral React key — not persisted */
  _key: string;
  /** DB UUID present for items loaded from the database */
  id?: string;
  service_name: string;
  qty:          number;
  rate:         number;
  sort_order:   number;
}

interface ProposalForm {
  clientName:   string;
  clientEmail:  string;
  clientPhone:  string;
  proposalDate: string;
  validUntil:   string;
  status:       ProposalStatus;
  notes:        string;
  services:     ServiceLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n);
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

function fmtDateShort(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function newLine(sortOrder: number): ServiceLine {
  return {
    _key: crypto.randomUUID(),
    service_name: '',
    qty: 1,
    rate: 0,
    sort_order: sortOrder,
  };
}

function generateProposalNumber(list: ProposalSummary[]): string {
  const max = Math.max(
    1000,
    ...list.map(p => parseInt(p.proposal_number.replace('PRO-', ''), 10) || 0),
  );
  return `PRO-${max + 1}`;
}

const EMPTY_FORM: ProposalForm = {
  clientName:   '',
  clientEmail:  '',
  clientPhone:  '',
  proposalDate: todayStr(),
  validUntil:   addDays(todayStr(), 30),
  status:       'Draft',
  notes:        'Payment due within 15 days of acceptance. Prices are subject to change after the validity date.',
  services:     [newLine(0)],
};

// ─── Proposal Preview (printable) ─────────────────────────────────────────────

interface PreviewData {
  clientName:   string;
  clientEmail:  string;
  clientPhone:  string;
  proposalDate: string;
  validUntil:   string;
  notes:        string;
  services:     ServiceLine[];
  proposalNumber: string;
}

function ProposalPreview({
  data,
  printRef,
}: {
  data: PreviewData;
  printRef: React.RefObject<HTMLDivElement | null>;
}) {
  const subtotal = data.services.reduce((s, l) => s + l.qty * l.rate, 0);
  const tax      = Math.round(subtotal * GST_RATE);
  const total    = subtotal + tax;

  return (
    <div
      ref={printRef}
      id="proposal-print"
      className="bg-white rounded-xl border border-border shadow-sm p-8 print:shadow-none print:border-none print:rounded-none print:p-0"
    >
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
          {data.proposalNumber && (
            <p className="text-xs text-muted-foreground font-medium">{data.proposalNumber}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Date: {fmtDate(data.proposalDate)}</p>
          {data.validUntil && (
            <p className="text-xs text-muted-foreground">Valid until: {fmtDate(data.validUntil)}</p>
          )}
        </div>
      </div>

      {/* Client details */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Prepared for
        </p>
        <p className="text-lg font-bold text-foreground">{data.clientName || '—'}</p>
        {data.clientEmail && (
          <p className="text-sm text-muted-foreground">{data.clientEmail}</p>
        )}
        {data.clientPhone && (
          <p className="text-sm text-muted-foreground">{data.clientPhone}</p>
        )}
      </div>

      {/* Services table */}
      <table className="w-full mb-6 text-sm">
        <thead>
          <tr className="bg-primary/10">
            <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground rounded-tl-lg">
              Service / Description
            </th>
            <th className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground w-16">
              Qty
            </th>
            <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground w-28">
              Rate
            </th>
            <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground w-28 rounded-tr-lg">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {data.services.map((line, i) => (
            <tr key={line._key} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/30'}>
              <td className="px-3 py-2.5 text-foreground">
                {line.service_name || <span className="text-muted-foreground italic">—</span>}
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">{line.qty}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{formatINR(line.rate)}</td>
              <td className="px-3 py-2.5 text-right font-medium text-foreground">
                {formatINR(line.qty * line.rate)}
              </td>
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
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Notes
          </p>
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
  const { profile, isAdmin, isTelecaller } = useAuth();
  // Managers, company admins, and super admins may send proposals and delete them.
  // Employees (telecallers) have read-only access to the proposal list.
  const canSend   = !isTelecaller; // manager | company_admin | super_admin
  const canDelete = isAdmin;       // company_admin | super_admin
  const printRef = useRef<HTMLDivElement>(null);

  // ── Server state ───────────────────────────────────────────────────────────
  const [proposals,        setProposals]        = useState<ProposalSummary[]>([]);
  const [company,          setCompany]          = useState<CompanyRow | null>(null);
  const [loadingList,      setLoadingList]      = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [loadingProposal,  setLoadingProposal]  = useState(false);
  const [deletingId,       setDeletingId]       = useState<string | null>(null);
  const [sending,          setSending]          = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  /** UUID of the proposal currently loaded in the form; null when composing new */
  const [savedProposalId,  setSavedProposalId]  = useState<string | null>(null);
  const [savedProposalNum, setSavedProposalNum] = useState<string>('');
  const [previewVisible,   setPreviewVisible]   = useState(false);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<ProposalForm>(EMPTY_FORM);

  // ── Fetch proposals list ───────────────────────────────────────────────────

  const fetchProposals = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('proposals')
      .select('id, proposal_number, client_name, status, total, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ProposalPage] fetch list error', error);
      toast.error('Could not load proposals', { description: error.message });
    } else {
      setProposals((data ?? []) as ProposalSummary[]);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    if (profile?.company_id) fetchProposals();
  }, [profile?.company_id, fetchProposals]);

  // ── Fetch company branding ─────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase
      .from('companies')
      .select('id, name, address, email, phone, website, gst_number, logo_url')
      .eq('id', profile.company_id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('[ProposalPage] fetch company error', error);
        } else {
          setCompany(data as CompanyRow);
        }
      });
  }, [profile?.company_id]);

  // ── Load a saved proposal into the form ───────────────────────────────────

  const handleLoad = async (id: string) => {
    setLoadingProposal(true);
    setPreviewVisible(false);

    const [proposalRes, itemsRes] = await Promise.all([
      supabase
        .from('proposals')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('proposal_items')
        .select('*')
        .eq('proposal_id', id)
        .order('sort_order', { ascending: true }),
    ]);

    setLoadingProposal(false);

    if (proposalRes.error) {
      console.error('[ProposalPage] load proposal error', proposalRes.error);
      toast.error('Could not load proposal', { description: proposalRes.error.message });
      return;
    }

    const p = proposalRes.data;
    const items = (itemsRes.data ?? []);

    const services: ServiceLine[] = items.length > 0
      ? items.map(item => ({
          _key:         item.id as string,
          id:           item.id as string,
          service_name: item.service_name as string,
          qty:          item.quantity as number,
          rate:         item.unit_price as number,
          sort_order:   item.sort_order as number,
        }))
      : [newLine(0)];

    setForm({
      clientName:   p.client_name,
      clientEmail:  p.client_email,
      clientPhone:  p.client_phone,
      proposalDate: (p.created_at as string).split('T')[0],
      validUntil:   (p.validity_date as string | null) ?? '',
      status:       p.status as ProposalStatus,
      notes:        p.notes,
      services,
    });

    setSavedProposalId(id);
    setSavedProposalNum(p.proposal_number as string);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Soft-delete a proposal ────────────────────────────────────────────────

  const handleDelete = async (id: string, proposalNumber: string) => {
    if (!window.confirm(`Delete proposal ${proposalNumber}? This cannot be undone from the app.`)) return;

    setDeletingId(id);

    const { error } = await supabase
      .from('proposals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    setDeletingId(null);

    if (error) {
      console.error('[ProposalPage] soft-delete error', error);
      toast.error('Could not delete proposal', { description: error.message });
      return;
    }

    toast.success(`Proposal ${proposalNumber} deleted`);

    // If the deleted proposal was loaded in the form, reset to blank
    if (savedProposalId === id) {
      handleNew();
    }

    await fetchProposals();
  };

  // ── Reset to a blank new proposal ─────────────────────────────────────────

  const handleNew = () => {
    setForm(EMPTY_FORM);
    setSavedProposalId(null);
    setSavedProposalNum('');
    setPreviewVisible(false);
  };

  // ── Save (create) or Update proposal ──────────────────────────────────────

  const handleSave = async () => {
    if (!profile?.company_id) {
      toast.error('No company assigned to your profile. Contact your admin.');
      return;
    }
    if (!form.clientName.trim()) {
      toast.error('Client name is required before saving.');
      return;
    }

    setSaving(true);

    const subtotal = form.services.reduce((s, l) => s + l.qty * l.rate, 0);
    const tax      = Math.round(subtotal * GST_RATE);
    const total    = subtotal + tax;

    const proposalPayload = {
      company_id:     profile.company_id,
      client_name:    form.clientName.trim(),
      client_email:   form.clientEmail.trim(),
      client_phone:   form.clientPhone.trim(),
      status:         form.status,
      subtotal,
      tax,
      total,
      notes:          form.notes,
      validity_date:  form.validUntil || null,
      expiry_date:    form.validUntil || null,
    };

    // ── Create ────────────────────────────────────────────────────────────
    if (!savedProposalId) {
      const proposalNumber = generateProposalNumber(proposals);

      const { data: proposal, error: proposalErr } = await supabase
        .from('proposals')
        .insert({ ...proposalPayload, proposal_number: proposalNumber, created_by: profile.id })
        .select('id, proposal_number')
        .single();

      if (proposalErr) {
        console.error('[ProposalPage] insert proposal error', proposalErr);
        toast.error('Failed to save proposal', { description: proposalErr.message });
        setSaving(false);
        return;
      }

      const proposalId = proposal.id as string;

      const itemRows = form.services.map((svc, idx) => ({
        proposal_id:  proposalId,
        service_name: svc.service_name || '(Unnamed service)',
        description:  '',
        quantity:     svc.qty,
        unit_price:   svc.rate,
        discount:     0,
        tax_rate:     GST_RATE * 100,
        total:        svc.qty * svc.rate,
        sort_order:   idx,
      }));

      const { error: itemsErr } = await supabase.from('proposal_items').insert(itemRows);

      if (itemsErr) {
        console.error('[ProposalPage] insert items error', itemsErr);
        toast.error('Proposal saved but line items failed', { description: itemsErr.message });
      } else {
        toast.success(`Proposal ${proposal.proposal_number} created`);
      }

      setSavedProposalId(proposalId);
      setSavedProposalNum(proposal.proposal_number as string);
      await fetchProposals();

    // ── Update ────────────────────────────────────────────────────────────
    } else {
      const { error: updateErr } = await supabase
        .from('proposals')
        .update(proposalPayload)
        .eq('id', savedProposalId);

      if (updateErr) {
        console.error('[ProposalPage] update proposal error', updateErr);
        toast.error('Failed to update proposal', { description: updateErr.message });
        setSaving(false);
        return;
      }

      // Replace all items: delete existing then insert fresh
      const { error: deleteErr } = await supabase
        .from('proposal_items')
        .delete()
        .eq('proposal_id', savedProposalId);

      if (deleteErr) {
        console.error('[ProposalPage] delete items error', deleteErr);
        toast.error('Proposal updated but line items failed', { description: deleteErr.message });
        setSaving(false);
        return;
      }

      const itemRows = form.services.map((svc, idx) => ({
        proposal_id:  savedProposalId,
        service_name: svc.service_name || '(Unnamed service)',
        description:  '',
        quantity:     svc.qty,
        unit_price:   svc.rate,
        discount:     0,
        tax_rate:     GST_RATE * 100,
        total:        svc.qty * svc.rate,
        sort_order:   idx,
      }));

      const { error: itemsErr } = await supabase.from('proposal_items').insert(itemRows);

      if (itemsErr) {
        console.error('[ProposalPage] re-insert items error', itemsErr);
        toast.error('Proposal updated but line items failed', { description: itemsErr.message });
      } else {
        toast.success(`Proposal ${savedProposalNum} updated`);
      }

      await fetchProposals();
    }

    setSaving(false);
  };

  // ── PDF builder (shared between Download and Send via Email) ─────────────────

  const buildProposalDoc = async (): Promise<jsPDF> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const pageW  = 210;
    const pageH  = 297;
    const margin = 14;
    const cW     = pageW - margin * 2;

    // ── Palette ──────────────────────────────────────────────────────────────
    const primary: [number, number, number] = [79,  70, 229];
    const muted:   [number, number, number] = [107, 114, 128];
    const dark:    [number, number, number] = [17,  24,  39];
    const rule:    [number, number, number] = [229, 231, 235];

    // Currency: jsPDF built-in fonts don't carry ₹ — use Rs.
    const fmtMoney = (n: number) =>
      'Rs. ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

    // ── Fetch logo as base64 (graceful: skip on any error) ───────────────────
    let logoDataUrl: string | null = null;
    let logoFormat: 'JPEG' | 'PNG' = 'JPEG';

    if (company?.logo_url) {
      try {
        const res  = await fetch(company.logo_url);
        const blob = await res.blob();
        logoFormat = blob.type.includes('png') ? 'PNG' : 'JPEG';
        logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        logoDataUrl = null; // skip logo silently
      }
    }

    // ── Header: company (left) + PROPOSAL label (right) ──────────────────────
    const logoSize   = 14; // mm, square
    const textStartX = logoDataUrl ? margin + logoSize + 3 : margin;
    let y = 14;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, logoFormat, margin, y - 3, logoSize, logoSize);
    }

    // Company name
    if (company?.name) {
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primary);
      doc.text(company.name, textStartX, y);
      y += 5;
    }

    // Address (may be multi-line)
    if (company?.address) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...muted);
      const addrLines = doc.splitTextToSize(company.address, 90) as string[];
      doc.text(addrLines, textStartX, y);
      y += addrLines.length * 3.8;
    }

    // Email · Phone on one line; omit whichever is absent
    const contactParts: string[] = [];
    if (company?.email)   contactParts.push(company.email);
    if (company?.phone)   contactParts.push(company.phone);
    if (contactParts.length > 0) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...muted);
      doc.text(contactParts.join('  •  '), textStartX, y);
      y += 3.8;
    }

    // Website
    if (company?.website) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...muted);
      doc.text(company.website, textStartX, y);
      y += 3.8;
    }

    // GST number
    if (company?.gst_number) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...muted);
      doc.text(`GST: ${company.gst_number}`, textStartX, y);
      y += 3.8;
    }

    // Right column: PROPOSAL label + meta
    const rX     = pageW - margin;
    const rTopY  = 14;

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dark);
    doc.text('PROPOSAL', rX, rTopY, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    let rY = rTopY + 6;
    if (savedProposalNum) {
      doc.text(savedProposalNum, rX, rY, { align: 'right' });
      rY += 5;
    }
    doc.text(`Date: ${fmtDate(form.proposalDate)}`, rX, rY, { align: 'right' });
    if (form.validUntil) {
      rY += 4;
      doc.text(`Valid until: ${fmtDate(form.validUntil)}`, rX, rY, { align: 'right' });
    }

    // Advance y past whichever column (left or right) is taller
    y = Math.max(y, rY) + 6;

    // Primary rule below header
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 9;

    // ── Client details ────────────────────────────────────────────────────────
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...muted);
    doc.text('PREPARED FOR', margin, y);
    y += 5;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dark);
    doc.text(form.clientName || '—', margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    if (form.clientEmail) { doc.text(form.clientEmail, margin, y); y += 4.5; }
    if (form.clientPhone) { doc.text(form.clientPhone, margin, y); y += 4.5; }
    y += 5;

    // ── Services table ────────────────────────────────────────────────────────
    const cDesc  = cW - 22 - 30 - 30;
    const colX   = [
      margin,
      margin + cDesc,
      margin + cDesc + 22,
      margin + cDesc + 22 + 30,
    ];
    const colEnd = pageW - margin;
    const rowH   = 7.5;

    doc.setFillColor(235, 233, 255);
    doc.rect(margin, y, cW, rowH, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dark);
    doc.text('SERVICE / DESCRIPTION', colX[0] + 2,  y + 5);
    doc.text('QTY',                   colX[1] + 11, y + 5, { align: 'center' });
    doc.text('RATE',                  colX[2] + 30, y + 5, { align: 'right' });
    doc.text('AMOUNT',                colEnd,        y + 5, { align: 'right' });
    y += rowH;

    form.services.forEach((svc, i) => {
      if (i % 2 === 1) {
        doc.setFillColor(248, 248, 252);
        doc.rect(margin, y, cW, rowH, 'F');
      }
      const amount = svc.qty * svc.rate;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...dark);
      doc.text(svc.service_name || '—', colX[0] + 2, y + 5);

      doc.setTextColor(...muted);
      doc.text(String(svc.qty),    colX[1] + 11, y + 5, { align: 'center' });
      doc.text(fmtMoney(svc.rate), colX[2] + 30, y + 5, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...dark);
      doc.text(fmtMoney(amount), colEnd, y + 5, { align: 'right' });

      y += rowH;
    });

    y += 5;

    // ── Totals ────────────────────────────────────────────────────────────────
    const subtotal = form.services.reduce((s, l) => s + l.qty * l.rate, 0);
    const tax      = Math.round(subtotal * GST_RATE);
    const total    = subtotal + tax;

    const tLabelX = pageW - margin - 58;
    const tValueX = pageW - margin;

    doc.setDrawColor(...rule);
    doc.setLineWidth(0.3);
    doc.line(tLabelX, y, tValueX, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.text('Subtotal', tLabelX, y);
    doc.setTextColor(...dark);
    doc.text(fmtMoney(subtotal), tValueX, y, { align: 'right' });
    y += 5.5;

    doc.setTextColor(...muted);
    doc.text('GST (18%)', tLabelX, y);
    doc.setTextColor(...dark);
    doc.text(fmtMoney(tax), tValueX, y, { align: 'right' });
    y += 3;

    doc.setDrawColor(...rule);
    doc.line(tLabelX, y, tValueX, y);
    y += 5.5;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text('Total',         tLabelX, y);
    doc.text(fmtMoney(total), tValueX, y, { align: 'right' });
    y += 12;

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (form.notes.trim()) {
      doc.setDrawColor(...rule);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...muted);
      doc.text('NOTES', margin, y);
      y += 4.5;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...dark);
      const noteLines = doc.splitTextToSize(form.notes, cW);
      doc.text(noteLines, margin, y);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 15, pageW - margin, pageH - 15);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    const footerLeft = company?.name ?? '';
    if (footerLeft) doc.text(footerLeft, margin, pageH - 10);
    doc.text('Thank you for your business!', pageW - margin, pageH - 10, { align: 'right' });

    return doc;
  };

  // ── PDF download ───────────────────────────────────────────────────────────

  const handlePrint = async () => {
    const doc      = await buildProposalDoc();
    const safeName = (form.clientName || 'Client').replace(/\s+/g, '_');
    const filename = savedProposalNum
      ? `Proposal-${savedProposalNum}-${safeName}.pdf`
      : `Proposal-${safeName}.pdf`;
    doc.save(filename);
  };

  // ── Send via Email ─────────────────────────────────────────────────────────

  const handleSendEmail = async () => {
    if (!savedProposalId) {
      toast.error('Save the proposal before sending.');
      return;
    }
    if (!form.clientEmail) {
      toast.error('No client email address on this proposal.');
      return;
    }

    setSending(true);
    try {
      const doc       = await buildProposalDoc();
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Session expired — please log in again.');
        setSending(false);
        return;
      }

      const res = await fetch('/api/proposals/send-email', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ proposalId: savedProposalId, pdfBase64 }),
      });

      const json = await res.json().catch(() => ({})) as { code?: string; error?: string };

      if (!res.ok) {
        if (json.code === 'EMAIL_NOT_CONFIGURED') {
          toast.error('Email service not configured', {
            description: 'Ask your administrator to set up SMTP credentials.',
          });
        } else {
          toast.error('Failed to send email', { description: json.error ?? res.statusText });
        }
        setSending(false);
        return;
      }

      toast.success(`Proposal sent to ${form.clientEmail}`);
      // Reflect the status change locally and refresh the list
      setField('status', 'Sent');
      await fetchProposals();
    } catch (err) {
      console.error('[ProposalPage] send email error', err);
      toast.error('Unexpected error while sending email');
    }
    setSending(false);
  };

  // ── WhatsApp share ─────────────────────────────────────────────────────────

  const handleWhatsApp = () => {
    const subtotal = form.services.reduce((s, l) => s + l.qty * l.rate, 0);
    const total    = Math.round(subtotal * 1.18);
    const msg = [
      `Hello ${form.clientName || 'there'}! 👋`,
      ``,
      `We're pleased to share our proposal for you:`,
      ``,
      `📋 *Services:*`,
      ...form.services
        .filter(s => s.service_name)
        .map(s => `  • ${s.service_name} (Qty: ${s.qty}) — ${formatINR(s.qty * s.rate)}`),
      ``,
      `💰 *Total (incl. 18% GST): ${formatINR(total)}*`,
      ``,
      `Valid until: ${fmtDate(form.validUntil)}`,
      ``,
      `Please feel free to reach out for any questions!`,
      `— CRM Pro Team`,
    ].join('\n');
    const phone = form.clientPhone.replace(/\D/g, '');
    const url   = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // ── Field helpers ──────────────────────────────────────────────────────────

  const setField = <K extends keyof ProposalForm>(key: K, val: ProposalForm[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const addService = () =>
    setForm(f => ({
      ...f,
      services: [...f.services, newLine(f.services.length)],
    }));

  const removeService = (_key: string) =>
    setForm(f => ({ ...f, services: f.services.filter(s => s._key !== _key) }));

  const updateService = (_key: string, key: keyof ServiceLine, value: string | number) =>
    setForm(f => ({
      ...f,
      services: f.services.map(s => s._key === _key ? { ...s, [key]: value } : s),
    }));

  // ── Derived ────────────────────────────────────────────────────────────────

  const subtotal       = form.services.reduce((s, l) => s + l.qty * l.rate, 0);
  const total          = Math.round(subtotal * (1 + GST_RATE));
  const isEditing      = savedProposalId !== null;
  const previewData: PreviewData = {
    ...form,
    proposalNumber: savedProposalNum,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Proposal Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? `Editing ${savedProposalNum} — changes are saved to the database`
              : 'Create and save professional proposals linked to your CRM data'}
          </p>
        </div>
        {isEditing && (
          <button
            onClick={handleNew}
            className="flex items-center gap-2 rounded-xl border border-border bg-card text-foreground font-medium px-4 py-2.5 text-sm hover:bg-muted transition-colors min-h-[44px] self-start"
          >
            <FilePlus className="h-4 w-4" />
            New Proposal
          </button>
        )}
      </div>

      {/* ── Saved proposals list ─────────────────────────────────────────── */}
      {(loadingList || proposals.length > 0) && (
        <div className="mb-6 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Saved Proposals</h2>
            {!isEditing && (
              <button
                onClick={handleNew}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors min-h-[32px] px-2"
              >
                <FilePlus className="h-3.5 w-3.5" />
                New
              </button>
            )}
          </div>

          {loadingList ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading proposals…</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      #
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Client
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Total
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Date
                    </th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {proposals.map(p => (
                    <tr
                      key={p.id}
                      className={clsx(
                        'border-b border-border last:border-0 transition-colors',
                        savedProposalId === p.id
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/30',
                      )}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {p.proposal_number}
                      </td>
                      <td className="px-5 py-3 font-medium text-foreground">
                        {p.client_name}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={clsx(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            STATUS_STYLES[p.status],
                          )}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">
                        {formatINR(p.total)}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {fmtDateShort(p.created_at)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-3">
                          {loadingProposal && savedProposalId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <button
                              onClick={() => handleLoad(p.id)}
                              disabled={savedProposalId === p.id}
                              className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40 disabled:cursor-default transition-colors"
                            >
                              {savedProposalId === p.id ? 'Loaded' : 'Load'}
                            </button>
                          )}
                          {canDelete && (
                            deletingId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <button
                                onClick={() => handleDelete(p.id, p.proposal_number)}
                                disabled={deletingId !== null}
                                className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                                title="Delete proposal"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Main two-column layout ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Form panel ────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Client info */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Client Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Client Name *
                </label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="e.g. Priya Sharma"
                  value={form.clientName}
                  onChange={e => setField('clientName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Client Email
                </label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="client@example.com"
                  value={form.clientEmail}
                  onChange={e => setField('clientEmail', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Client Phone (for WhatsApp)
                </label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="+91 98000 00000"
                  value={form.clientPhone}
                  onChange={e => setField('clientPhone', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Proposal Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={form.proposalDate}
                  onChange={e => setField('proposalDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Valid Until
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={form.validUntil}
                  onChange={e => setField('validUntil', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Status
                </label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={form.status}
                  onChange={e => setField('status', e.target.value as ProposalStatus)}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
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

            {form.services.map(svc => (
              <div key={svc._key} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="col-span-12 sm:col-span-6 rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Service description"
                  value={svc.service_name}
                  onChange={e => updateService(svc._key, 'service_name', e.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  className="col-span-4 sm:col-span-2 rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Qty"
                  value={svc.qty}
                  onChange={e => updateService(svc._key, 'qty', Number(e.target.value))}
                />
                <input
                  type="number"
                  min="0"
                  className="col-span-6 sm:col-span-3 rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Rate (₹)"
                  value={svc.rate || ''}
                  onChange={e => updateService(svc._key, 'rate', Number(e.target.value))}
                />
                <button
                  onClick={() => removeService(svc._key)}
                  disabled={form.services.length === 1}
                  className="col-span-2 sm:col-span-1 flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <div className="flex justify-end pt-2 border-t border-border">
              <div className="text-sm font-semibold text-foreground">
                Total (incl. GST):{' '}
                <span className="text-primary">{formatINR(total)}</span>
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

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-3 text-sm hover:bg-primary/90 transition-colors min-h-[44px] disabled:opacity-60"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <><Save className="h-4 w-4" /> {isEditing ? 'Update Proposal' : 'Save Proposal'}</>
              )}
            </button>
            <button
              onClick={() => setPreviewVisible(v => !v)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card text-foreground font-medium px-5 py-3 text-sm hover:bg-muted transition-colors min-h-[44px]"
            >
              <FileText className="h-4 w-4" />
              {previewVisible ? 'Hide Preview' : 'Preview'}
            </button>
          </div>
        </div>

        {/* ── Preview panel ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {previewVisible ? (
            <>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card text-foreground font-medium px-4 py-2.5 text-sm hover:bg-muted transition-colors min-h-[44px]"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                {canSend && (
                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !savedProposalId || !form.clientEmail}
                    title={
                      !savedProposalId
                        ? 'Save the proposal first'
                        : !form.clientEmail
                          ? 'No client email on this proposal'
                          : 'Send PDF to client via email'
                    }
                    className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-medium px-4 py-2.5 text-sm hover:bg-primary/90 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                      : <><Mail className="h-4 w-4" /> Send via Email</>
                    }
                  </button>
                )}
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center gap-2 rounded-xl bg-[#25D366] text-white font-medium px-4 py-2.5 text-sm hover:bg-[#1ebe5d] transition-colors min-h-[44px]"
                >
                  <Share2 className="h-4 w-4" />
                  Share via WhatsApp
                </button>
              </div>
              <ProposalPreview data={previewData} printRef={printRef} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-muted/30 rounded-xl border-2 border-dashed border-border text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Click "Preview" to see</p>
              <p className="text-sm">the formatted proposal</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
