import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  Globe, FileText, Layers, Clock, CheckCircle2, AlertCircle,
  Download, ExternalLink, Building2, Bell, MessageSquare,
  FolderOpen, Plus, X, Send, Loader2, ShieldAlert, Info,
  AlertTriangle, ChevronDown, ChevronRight, Receipt,
  LayoutDashboard, Calendar, LayoutGrid, Paperclip, User,
  CheckCircle, File,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'invoices' | 'documents' | 'projects' | 'support' | 'notifications';
type InvoiceStatus = 'Paid' | 'Pending' | 'Overdue';
type ProjectStatus = 'Planning' | 'In Progress' | 'Review' | 'Completed' | 'On Hold';
type TaskStatus = 'Todo' | 'In Progress' | 'Done';
type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
type TicketPriority = 'Low' | 'Medium' | 'High';
type NotifType = 'info' | 'success' | 'warning' | 'alert';

interface PortalInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  amount: number;
  due_date: string;
  status: InvoiceStatus;
}

interface PortalProject {
  id: string;
  project_name: string;
  client: string;
  website_type: string;
  status: ProjectStatus;
  assigned_to: string;
  deadline: string | null;
  updated_at: string;
}

interface PortalTask {
  id: string;
  project_id: string;
  task_name: string;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: string;
}

interface PortalDocument {
  id: string;
  name: string;
  description: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
}

interface SupportTicket {
  id: string;
  created_by: string;
  creator_name: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  sender_name: string;
  message: string;
  is_staff: boolean;
  created_at: string;
}

interface PortalNotification {
  id: string;
  title: string;
  message: string;
  type: NotifType;
  is_read: boolean;
  created_at: string;
}

// ─── Display constants ────────────────────────────────────────────────────────

const INV_STATUS_STYLES: Record<InvoiceStatus, string> = {
  Paid:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-100   text-amber-700   border-amber-200',
  Overdue: 'bg-red-100     text-red-700     border-red-200',
};
const INV_STATUS_ICONS: Record<InvoiceStatus, React.ElementType> = {
  Paid: CheckCircle2, Pending: Clock, Overdue: AlertCircle,
};

const PROJ_STATUS_STYLES: Record<string, string> = {
  'Planning':    'bg-gray-100   text-gray-600   border-gray-200',
  'In Progress': 'bg-blue-100   text-blue-700   border-blue-200',
  'Review':      'bg-amber-100  text-amber-700  border-amber-200',
  'Completed':   'bg-emerald-100 text-emerald-700 border-emerald-200',
  'On Hold':     'bg-red-100    text-red-600    border-red-200',
};
const PROJ_PROGRESS: Record<string, number> = {
  'Planning': 10, 'In Progress': 50, 'Review': 75, 'Completed': 100, 'On Hold': 25,
};
const PROJ_PROGRESS_BAR: Record<string, string> = {
  'Planning': 'bg-gray-400', 'In Progress': 'bg-blue-500',
  'Review': 'bg-amber-500', 'Completed': 'bg-emerald-500', 'On Hold': 'bg-red-400',
};

const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  'Todo':        'bg-gray-100  text-gray-600  border-gray-200',
  'In Progress': 'bg-blue-100 text-blue-700  border-blue-200',
  'Done':        'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const TKT_STATUS_STYLES: Record<TicketStatus, string> = {
  'Open':        'bg-blue-100  text-blue-700  border-blue-200',
  'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
  'Resolved':    'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Closed':      'bg-gray-100  text-gray-600  border-gray-200',
};
const TKT_PRIORITY_STYLES: Record<TicketPriority, string> = {
  Low:    'bg-gray-100  text-gray-600  border-gray-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  High:   'bg-red-100   text-red-700   border-red-200',
};

const NOTIF_CARD_STYLES: Record<NotifType, string> = {
  info:    'bg-blue-50    border-blue-200',
  success: 'bg-emerald-50 border-emerald-200',
  warning: 'bg-amber-50   border-amber-200',
  alert:   'bg-red-50     border-red-200',
};
const NOTIF_ICON_STYLES: Record<NotifType, string> = {
  info:    'text-blue-600    bg-blue-100',
  success: 'text-emerald-600 bg-emerald-100',
  warning: 'text-amber-600   bg-amber-100',
  alert:   'text-red-600     bg-red-100',
};
const NOTIF_ICONS: Record<NotifType, React.ElementType> = {
  info: Info, success: CheckCircle, warning: AlertTriangle, alert: AlertCircle,
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const s = iso.includes('T') ? iso : iso + 'T00:00:00';
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

function fmtFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

// ─── Real PDF generation using jsPDF (lazy-loaded) ───────────────────────────

async function generateInvoicePdf(invoice: PortalInvoice, companyName: string): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 20;

  // Header bar
  doc.setFillColor(15, 45, 94);
  doc.rect(0, 0, W, 45, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName || 'CRM Pro', M, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Business Suite', M, 30);

  // Invoice number (right-aligned)
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.invoice_number, W - M, 22, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Due: ${fmtDate(invoice.due_date)}`, W - M, 31, { align: 'right' });

  // Bill To
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO', M, 58);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.client_name, M, 67);

  // Status pill
  const isPaid = invoice.status === 'Paid';
  const isOvd  = invoice.status === 'Overdue';
  if (isPaid)      doc.setFillColor(209, 250, 229);
  else if (isOvd)  doc.setFillColor(254, 226, 226);
  else             doc.setFillColor(254, 243, 199);
  doc.roundedRect(W - M - 36, 57, 36, 10, 3, 3, 'F');
  if (isPaid)      doc.setTextColor(6, 95, 70);
  else if (isOvd)  doc.setTextColor(153, 27, 27);
  else             doc.setTextColor(146, 64, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.status, W - M - 18, 63.5, { align: 'center' });

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(M, 78, W - M, 78);

  // Table header
  doc.setFillColor(15, 45, 94);
  doc.rect(M, 84, W - 2 * M, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('#', M + 4, 90.5);
  doc.text('Description', M + 16, 90.5);
  doc.text('Amount', W - M - 4, 90.5, { align: 'right' });

  // Table row
  doc.setFillColor(248, 250, 252);
  doc.rect(M, 94, W - 2 * M, 12, 'F');
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('1', M + 4, 101.5);
  doc.text('Professional Services', M + 16, 101.5);
  doc.text(formatCurrency(invoice.amount), W - M - 4, 101.5, { align: 'right' });

  // Total row
  doc.setDrawColor(226, 232, 240);
  doc.line(M, 106, W - M, 106);
  doc.setFillColor(241, 245, 249);
  doc.rect(M, 106, W - 2 * M, 12, 'F');
  doc.setTextColor(15, 45, 94);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total', W - M - 55, 113.5);
  doc.text(formatCurrency(invoice.amount), W - M - 4, 113.5, { align: 'right' });

  // Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(M, 270, W - M, 270);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for your business · CRM Pro Business Suite', W / 2, 277, { align: 'center' });

  doc.save(`${invoice.invoice_number}.pdf`);
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border',
      className,
    )}>
      {label}
    </span>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-3.5 w-3/4 rounded bg-muted" />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="h-2 w-full rounded-full bg-muted" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function SectionHead({
  icon: Icon, title, count, action,
}: {
  icon: React.ElementType; title: string; count?: number; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {count !== undefined && (
          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientPortal() {
  const { profile, user, isAdmin, isTelecaller } = useAuth();
  const canManage = isAdmin || profile?.role === 'manager';

  // ── Data state ──────────────────────────────────────────────────────────────
  const [companyName,    setCompanyName]    = useState('');
  const [invoices,       setInvoices]       = useState<PortalInvoice[]>([]);
  const [projects,       setProjects]       = useState<PortalProject[]>([]);
  const [projectTasks,   setProjectTasks]   = useState<PortalTask[]>([]);
  const [documents,      setDocuments]      = useState<PortalDocument[]>([]);
  const [tickets,        setTickets]        = useState<SupportTicket[]>([]);
  const [notifications,  setNotifications]  = useState<PortalNotification[]>([]);
  const [ticketMessages, setTicketMessages] = useState<Record<string, TicketMessage[]>>({});

  // ── Loading state ───────────────────────────────────────────────────────────
  const [loadingInv,      setLoadingInv]      = useState(true);
  const [loadingProj,     setLoadingProj]     = useState(true);
  const [loadingDocs,     setLoadingDocs]     = useState(true);
  const [loadingTickets,  setLoadingTickets]  = useState(true);
  const [loadingNotif,    setLoadingNotif]    = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [downloadingId,   setDownloadingId]   = useState<string | null>(null);
  const [submittingTkt,   setSubmittingTkt]   = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [submittingDoc,   setSubmittingDoc]   = useState(false);
  const [submittingNotif, setSubmittingNotif] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab,        setActiveTab]        = useState<TabKey>('overview');
  const [projectView,      setProjectView]      = useState<'cards' | 'timeline'>('cards');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [ticketFilter,     setTicketFilter]     = useState<TicketStatus | 'All'>('All');
  const [showNewTicket,    setShowNewTicket]     = useState(false);
  const [showAddDoc,       setShowAddDoc]        = useState(false);
  const [showAddNotif,     setShowAddNotif]      = useState(false);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [tktForm,     setTktForm]     = useState({ subject: '', description: '', priority: 'Medium' });
  const [ticketReply, setTicketReply] = useState('');
  const [docForm,     setDocForm]     = useState({ name: '', description: '', file_url: '', file_type: 'PDF' });
  const [notifForm,   setNotifForm]   = useState({ title: '', message: '', type: 'info' as NotifType });

  // ── Fetch functions ─────────────────────────────────────────────────────────

  const fetchCompany = useCallback(async () => {
    if (!profile?.company_id) return;
    const { data } = await supabase
      .from('companies').select('name').eq('id', profile.company_id).single();
    if (data?.name) setCompanyName(data.name);
  }, [profile?.company_id]);

  const fetchInvoices = useCallback(async () => {
    setLoadingInv(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, amount, status, due_date')
      .order('created_at', { ascending: false });
    if (error) toast.error('Could not load invoices', { description: error.message });
    else setInvoices((data ?? []) as PortalInvoice[]);
    setLoadingInv(false);
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProj(true);
    const [projRes, tasksRes] = await Promise.all([
      supabase
        .from('website_projects')
        .select('id, project_name, client, website_type, status, assigned_to, deadline, updated_at')
        .order('updated_at', { ascending: false }),
      supabase
        .from('website_project_tasks')
        .select('id, project_id, task_name, status, due_date, assigned_to')
        .order('due_date', { ascending: true }),
    ]);
    if (!projRes.error)  setProjects((projRes.data ?? []) as PortalProject[]);
    if (!tasksRes.error) setProjectTasks((tasksRes.data ?? []) as PortalTask[]);
    setLoadingProj(false);
  }, []);

  const fetchDocuments = useCallback(async () => {
    setLoadingDocs(true);
    const { data, error } = await supabase
      .from('client_documents')
      .select('id, name, description, file_url, file_type, file_size, created_at')
      .order('created_at', { ascending: false });
    if (error) toast.error('Could not load documents', { description: error.message });
    else setDocuments((data ?? []) as PortalDocument[]);
    setLoadingDocs(false);
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoadingTickets(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, created_by, creator_name, subject, description, status, priority, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) toast.error('Could not load tickets', { description: error.message });
    else setTickets((data ?? []) as SupportTicket[]);
    setLoadingTickets(false);
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoadingNotif(true);
    const { data, error } = await supabase
      .from('client_notifications')
      .select('id, title, message, type, is_read, created_at')
      .order('created_at', { ascending: false });
    if (error) toast.error('Could not load notifications', { description: error.message });
    else setNotifications((data ?? []) as PortalNotification[]);
    setLoadingNotif(false);
  }, []);

  // Lazy-load messages when a ticket is expanded
  useEffect(() => {
    if (!expandedTicketId) return;
    if (ticketMessages[expandedTicketId] !== undefined) return; // already loaded
    setLoadingMessages(true);
    supabase
      .from('support_ticket_messages')
      .select('id, sender_name, message, is_staff, created_at')
      .eq('ticket_id', expandedTicketId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error) {
          setTicketMessages(prev => ({
            ...prev,
            [expandedTicketId]: (data ?? []) as TicketMessage[],
          }));
        }
        setLoadingMessages(false);
      });
  }, [expandedTicketId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire all fetches once company_id is available
  useEffect(() => {
    if (!profile?.company_id) return;
    fetchCompany();
    fetchInvoices();
    fetchProjects();
    fetchDocuments();
    fetchTickets();
    fetchNotifications();
  }, [profile?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalPaid        = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + i.amount, 0);
  const totalOutstanding = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.amount, 0);
  const openTickets      = tickets.filter(t => t.status === 'Open' || t.status === 'In Progress').length;
  const unreadCount      = notifications.filter(n => !n.is_read).length;

  const tasksByProject = projectTasks.reduce<Record<string, PortalTask[]>>((acc, task) => {
    if (!acc[task.project_id]) acc[task.project_id] = [];
    acc[task.project_id].push(task);
    return acc;
  }, {});

  const filteredTickets = ticketFilter === 'All'
    ? tickets
    : tickets.filter(t => t.status === ticketFilter);

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleDownloadPdf = async (invoice: PortalInvoice) => {
    setDownloadingId(invoice.id);
    try {
      await generateInvoicePdf(invoice, companyName);
      toast.success(`${invoice.invoice_number}.pdf downloaded`);
    } catch (err) {
      console.error('[ClientPortal] PDF error', err);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tktForm.subject.trim() || !tktForm.description.trim() || !profile) return;
    setSubmittingTkt(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        company_id:   profile.company_id,
        created_by:   user!.id,
        creator_name: profile.full_name,
        subject:      tktForm.subject.trim(),
        description:  tktForm.description.trim(),
        priority:     tktForm.priority,
      })
      .select('id, created_by, creator_name, subject, description, status, priority, created_at, updated_at')
      .single();
    setSubmittingTkt(false);
    if (error) { toast.error('Failed to create ticket', { description: error.message }); return; }
    setTickets(prev => [data as SupportTicket, ...prev]);
    setTktForm({ subject: '', description: '', priority: 'Medium' });
    setShowNewTicket(false);
    toast.success('Support ticket created');
  };

  const handleSendReply = async () => {
    if (!ticketReply.trim() || !expandedTicketId || !profile) return;
    setSubmittingReply(true);
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id:   expandedTicketId,
        company_id:  profile.company_id,
        sender_id:   user!.id,
        sender_name: profile.full_name,
        message:     ticketReply.trim(),
        is_staff:    canManage,
      })
      .select('id, sender_name, message, is_staff, created_at')
      .single();
    setSubmittingReply(false);
    if (error) { toast.error('Failed to send reply'); return; }
    setTicketMessages(prev => ({
      ...prev,
      [expandedTicketId]: [...(prev[expandedTicketId] ?? []), data as TicketMessage],
    }));
    setTicketReply('');
  };

  const handleTicketStatusChange = async (ticketId: string, status: TicketStatus) => {
    const { error } = await supabase
      .from('support_tickets').update({ status }).eq('id', ticketId);
    if (error) { toast.error('Failed to update status'); return; }
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
    toast.success('Ticket status updated');
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.name.trim() || !docForm.file_url.trim() || !profile) return;
    setSubmittingDoc(true);
    const { data, error } = await supabase
      .from('client_documents')
      .insert({
        company_id:  profile.company_id,
        name:        docForm.name.trim(),
        description: docForm.description.trim(),
        file_url:    docForm.file_url.trim(),
        file_type:   docForm.file_type,
        uploaded_by: user!.id,
      })
      .select('id, name, description, file_url, file_type, file_size, created_at')
      .single();
    setSubmittingDoc(false);
    if (error) { toast.error('Failed to add document', { description: error.message }); return; }
    setDocuments(prev => [data as PortalDocument, ...prev]);
    setDocForm({ name: '', description: '', file_url: '', file_type: 'PDF' });
    setShowAddDoc(false);
    toast.success('Document added');
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifForm.title.trim() || !profile) return;
    setSubmittingNotif(true);
    const { data, error } = await supabase
      .from('client_notifications')
      .insert({
        company_id: profile.company_id,
        user_id:    null,
        title:      notifForm.title.trim(),
        message:    notifForm.message.trim(),
        type:       notifForm.type,
        created_by: user!.id,
      })
      .select('id, title, message, type, is_read, created_at')
      .single();
    setSubmittingNotif(false);
    if (error) { toast.error('Failed to send notification', { description: error.message }); return; }
    setNotifications(prev => [data as PortalNotification, ...prev]);
    setNotifForm({ title: '', message: '', type: 'info' });
    setShowAddNotif(false);
    toast.success('Notification broadcast to team');
  };

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from('client_notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length) {
      await supabase.from('client_notifications').update({ is_read: true }).in('id', unreadIds);
    }
  };

  // ── Tab renders ─────────────────────────────────────────────────────────────

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Invoices',    value: String(invoices.length),     sub: 'All time',         color: 'text-primary' },
          { label: 'Amount Paid',       value: formatCurrency(totalPaid),   sub: 'Settled invoices', color: 'text-emerald-600' },
          { label: 'Outstanding',       value: formatCurrency(totalOutstanding), sub: 'Pending + overdue', color: 'text-amber-600' },
          { label: 'Open Tickets',      value: String(openTickets),         sub: 'Awaiting response', color: 'text-blue-600' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card shadow-sm p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{c.label}</p>
            <p className={clsx('text-lg sm:text-xl font-bold', c.color)}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent notifications */}
      <div>
        <SectionHead icon={Bell} title="Recent Notifications" count={unreadCount > 0 ? unreadCount : undefined} action={
          <button onClick={() => setActiveTab('notifications')} className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ExternalLink className="h-3 w-3" />
          </button>
        } />
        {loadingNotif ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No notifications yet.</p>
        ) : (
          <div className="space-y-2">
            {notifications.slice(0, 3).map(n => {
              const Icon = NOTIF_ICONS[n.type];
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={clsx(
                    'flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-opacity',
                    NOTIF_CARD_STYLES[n.type],
                    n.is_read && 'opacity-60',
                  )}
                >
                  <div className={clsx('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full', NOTIF_ICON_STYLES[n.type])}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">{n.title}</p>
                    {n.message && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{relTime(n.created_at)}</span>
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent invoices */}
      <div>
        <SectionHead icon={Receipt} title="Recent Invoices" action={
          <button onClick={() => setActiveTab('invoices')} className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ExternalLink className="h-3 w-3" />
          </button>
        } />
        {loadingInv ? (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full text-sm"><tbody>{[1,2,3].map(i => <SkeletonRow key={i} cols={5} />)}</tbody></table>
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No invoices yet.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {['Invoice', 'Client', 'Date', 'Amount', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 5).map((inv, idx) => {
                    const StatusIcon = INV_STATUS_ICONS[inv.status];
                    return (
                      <tr key={inv.id} className={clsx('border-b border-border last:border-0 hover:bg-muted/30', idx % 2 === 1 && 'bg-muted/10')}>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.invoice_number}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{inv.client_name}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                        <td className="px-4 py-3 font-semibold text-foreground tabular-nums">{formatCurrency(inv.amount)}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border', INV_STATUS_STYLES[inv.status])}>
                            <StatusIcon className="h-3 w-3" />{inv.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderInvoices = () => (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Invoices', value: String(invoices.length), color: 'text-primary' },
          { label: 'Total Revenue',  value: formatCurrency(invoices.reduce((s,i) => s + i.amount, 0)), color: 'text-primary' },
          { label: 'Paid',           value: formatCurrency(totalPaid), color: 'text-emerald-600' },
          { label: 'Outstanding',    value: formatCurrency(totalOutstanding), color: 'text-amber-600' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card shadow-sm p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{c.label}</p>
            <p className={clsx('text-xl font-bold', c.color)}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Invoice table */}
      <div>
        <SectionHead icon={Receipt} title="All Invoices" count={invoices.length} />
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {loadingInv ? (
            <table className="w-full text-sm"><tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} cols={6} />)}</tbody></table>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {['Invoice #', 'Client', 'Due Date', 'Amount', 'Status', 'Actions'].map((h, i) => (
                      <th key={h} className={clsx('px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide', i === 5 ? 'text-right' : 'text-left')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr><td colSpan={6}><EmptyState icon={Receipt} title="No invoices yet" sub="Invoices raised for your account will appear here." /></td></tr>
                  ) : invoices.map((inv, idx) => {
                    const StatusIcon = INV_STATUS_ICONS[inv.status];
                    const isDownloading = downloadingId === inv.id;
                    return (
                      <tr key={inv.id} className={clsx('border-b border-border last:border-0 hover:bg-muted/30 transition-colors', idx % 2 === 1 && 'bg-muted/10')}>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-primary">
                            <FileText className="h-3.5 w-3.5" />{inv.invoice_number}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-medium text-foreground whitespace-nowrap">{inv.client_name}</td>
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                        <td className="px-5 py-4 font-semibold text-foreground tabular-nums whitespace-nowrap">{formatCurrency(inv.amount)}</td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border', INV_STATUS_STYLES[inv.status])}>
                            <StatusIcon className="h-3 w-3" />{inv.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          {isTelecaller ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground cursor-not-allowed">
                              <ShieldAlert className="h-3 w-3" />Restricted
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDownloadPdf(inv)}
                              disabled={isDownloading}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60 min-h-[32px]"
                            >
                              {isDownloading
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Download className="h-3 w-3" />}
                              {isDownloading ? 'Generating…' : 'Download PDF'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderDocuments = () => (
    <div className="space-y-4">
      <SectionHead icon={FolderOpen} title="Documents" count={documents.length} action={
        canManage ? (
          <button
            onClick={() => setShowAddDoc(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />Add Document
          </button>
        ) : undefined
      } />

      {loadingDocs ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={FolderOpen}
            title="No documents shared yet"
            sub={canManage ? 'Click "Add Document" to share a file with your team.' : 'Documents shared with your account will appear here.'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map(doc => {
            const typeColors: Record<string, string> = {
              'PDF':   'bg-red-100  text-red-700  border-red-200',
              'Word':  'bg-blue-100 text-blue-700 border-blue-200',
              'Excel': 'bg-emerald-100 text-emerald-700 border-emerald-200',
              'Image': 'bg-violet-100 text-violet-700 border-violet-200',
              'Other': 'bg-gray-100 text-gray-600 border-gray-200',
            };
            return (
              <div key={doc.id} className="rounded-xl border border-border bg-card shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <File className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{fmtFileSize(doc.file_size)}</p>
                    </div>
                  </div>
                  <Badge label={doc.file_type} className={typeColors[doc.file_type] ?? typeColors['Other']} />
                </div>
                {doc.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
                )}
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />{fmtDate(doc.created_at)}
                  </span>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderProjects = () => (
    <div className="space-y-4">
      <SectionHead icon={Layers} title="Projects" count={projects.length} action={
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
          {(['cards', 'timeline'] as const).map(v => {
            const Icon = v === 'cards' ? LayoutGrid : Calendar;
            return (
              <button
                key={v}
                onClick={() => setProjectView(v)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors capitalize',
                  projectView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />{v}
              </button>
            );
          })}
        </div>
      } />

      {loadingProj ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState icon={Layers} title="No projects yet" sub="Website projects assigned to your account will appear here." />
        </div>
      ) : projectView === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map(proj => {
            const pct   = PROJ_PROGRESS[proj.status] ?? 0;
            const bar   = PROJ_PROGRESS_BAR[proj.status] ?? 'bg-gray-400';
            const tasks = tasksByProject[proj.id] ?? [];
            const doneTasks = tasks.filter(t => t.status === 'Done').length;
            return (
              <div key={proj.id} className="rounded-xl border border-border bg-card p-5 space-y-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{proj.project_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {proj.client ? `Client: ${proj.client}` : proj.website_type || '—'}
                    </p>
                  </div>
                  <Badge label={proj.status} className={PROJ_STATUS_STYLES[proj.status] ?? ''} />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Progress</span>
                    <span className="font-semibold text-foreground tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className={clsx('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 flex-shrink-0" />Updated {relTime(proj.updated_at)}
                  </span>
                  {tasks.length > 0 && (
                    <span>{doneTasks}/{tasks.length} tasks done</span>
                  )}
                </div>
                {proj.deadline && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />Deadline: {fmtDate(proj.deadline)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Timeline view */
        <div className="space-y-6">
          {projects.map(proj => {
            const tasks = (tasksByProject[proj.id] ?? []).slice().sort((a, b) => {
              if (!a.due_date && !b.due_date) return 0;
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return a.due_date.localeCompare(b.due_date);
            });
            return (
              <div key={proj.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                {/* Project header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-muted/30">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{proj.project_name}</p>
                    {proj.client && <p className="text-xs text-muted-foreground mt-0.5">Client: {proj.client}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {proj.deadline && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{fmtDate(proj.deadline)}
                      </span>
                    )}
                    <Badge label={proj.status} className={PROJ_STATUS_STYLES[proj.status] ?? ''} />
                  </div>
                </div>
                {/* Task timeline */}
                <div className="px-5 py-4">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No tasks added to this project yet.</p>
                  ) : (
                    <div className="relative pl-6">
                      {/* Vertical connector line */}
                      <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
                      <div className="space-y-4">
                        {tasks.map(task => {
                          const isDone = task.status === 'Done';
                          return (
                            <div key={task.id} className="relative flex items-start gap-3">
                              {/* Dot */}
                              <div className={clsx(
                                'absolute -left-4 mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                                isDone
                                  ? 'bg-emerald-500 border-emerald-500'
                                  : task.status === 'In Progress'
                                    ? 'bg-blue-500 border-blue-500'
                                    : 'bg-background border-border',
                              )}>
                                {isDone && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                              </div>
                              {/* Content */}
                              <div className={clsx('flex-1 min-w-0', isDone && 'opacity-60')}>
                                <p className={clsx('text-sm font-medium text-foreground', isDone && 'line-through')}>{task.task_name}</p>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                  <Badge label={task.status} className={clsx('text-[10px] py-0', TASK_STATUS_STYLES[task.status])} />
                                  {task.due_date && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />{fmtDate(task.due_date)}
                                    </span>
                                  )}
                                  {task.assigned_to && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <User className="h-3 w-3" />{task.assigned_to}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderSupport = () => (
    <div className="space-y-4">
      <SectionHead icon={MessageSquare} title="Support Tickets" count={tickets.length} action={
        <button
          onClick={() => setShowNewTicket(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />New Ticket
        </button>
      } />

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(['All', 'Open', 'In Progress', 'Resolved', 'Closed'] as const).map(s => (
          <button
            key={s}
            onClick={() => setTicketFilter(s)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-semibold border transition-colors',
              ticketFilter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/40',
            )}
          >
            {s}
            {s !== 'All' && (
              <span className="ml-1 opacity-70">({tickets.filter(t => t.status === s).length})</span>
            )}
          </button>
        ))}
      </div>

      {loadingTickets ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState icon={MessageSquare} title="No tickets" sub="Raise a new support ticket using the button above." />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map(ticket => {
            const isExpanded = expandedTicketId === ticket.id;
            const msgs = ticketMessages[ticket.id] ?? [];
            return (
              <div key={ticket.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                {/* Ticket row */}
                <button
                  className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedTicketId(isExpanded ? null : ticket.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{ticket.subject}</span>
                      <Badge label={ticket.status}   className={clsx('text-[10px]', TKT_STATUS_STYLES[ticket.status])} />
                      <Badge label={ticket.priority} className={clsx('text-[10px]', TKT_PRIORITY_STYLES[ticket.priority])} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Raised by {ticket.creator_name} · {relTime(ticket.created_at)}
                    </p>
                  </div>
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
                </button>

                {/* Expanded: thread + reply */}
                {isExpanded && (
                  <div className="border-t border-border px-5 pb-5">
                    {/* Admin status change */}
                    {canManage && (
                      <div className="flex items-center gap-2 py-3 border-b border-border mb-3">
                        <span className="text-xs font-semibold text-muted-foreground">Status:</span>
                        <select
                          value={ticket.status}
                          onChange={e => handleTicketStatusChange(ticket.id, e.target.value as TicketStatus)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                        >
                          {(['Open', 'In Progress', 'Resolved', 'Closed'] as TicketStatus[]).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Original description */}
                    <div className="mt-3 flex gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{ticket.creator_name}</span>
                          <span className="text-xs text-muted-foreground">{relTime(ticket.created_at)}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground bg-muted/40 rounded-lg px-3 py-2">{ticket.description}</p>
                      </div>
                    </div>

                    {/* Messages */}
                    {loadingMessages && msgs.length === 0 ? (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />Loading replies…
                      </div>
                    ) : msgs.map(msg => (
                      <div key={msg.id} className={clsx('mt-3 flex gap-3', msg.is_staff && 'flex-row-reverse')}>
                        <div className={clsx(
                          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                          msg.is_staff ? 'bg-primary/10' : 'bg-muted',
                        )}>
                          <User className={clsx('h-3.5 w-3.5', msg.is_staff ? 'text-primary' : 'text-muted-foreground')} />
                        </div>
                        <div className={clsx('flex-1', msg.is_staff && 'text-right')}>
                          <div className={clsx('flex items-center gap-2', msg.is_staff && 'justify-end')}>
                            <span className="text-xs font-semibold text-foreground">{msg.sender_name}</span>
                            {msg.is_staff && <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-semibold">Staff</span>}
                            <span className="text-xs text-muted-foreground">{relTime(msg.created_at)}</span>
                          </div>
                          <p className={clsx(
                            'mt-1 text-sm text-foreground rounded-lg px-3 py-2 inline-block text-left',
                            msg.is_staff ? 'bg-primary/10' : 'bg-muted/40',
                          )}>{msg.message}</p>
                        </div>
                      </div>
                    ))}

                    {/* Reply box */}
                    {ticket.status !== 'Closed' && (
                      <div className="mt-4 flex gap-2">
                        <input
                          value={ticketReply}
                          onChange={e => setTicketReply(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                          placeholder="Type a reply…"
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                        <button
                          onClick={handleSendReply}
                          disabled={!ticketReply.trim() || submittingReply}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {submittingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-4">
      <SectionHead icon={Bell} title="Notifications" count={unreadCount > 0 ? unreadCount : notifications.length} action={
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
          {canManage && (
            <button
              onClick={() => setShowAddNotif(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />Send
            </button>
          )}
        </div>
      } />

      {loadingNotif ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState icon={Bell} title="No notifications" sub="Notifications from your team will appear here." />
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = NOTIF_ICONS[n.type];
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={clsx(
                  'flex items-start gap-3 rounded-xl border p-4 transition-all',
                  NOTIF_CARD_STYLES[n.type],
                  !n.is_read && 'cursor-pointer hover:brightness-95',
                  n.is_read && 'opacity-60',
                )}
              >
                <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', NOTIF_ICON_STYLES[n.type])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground leading-tight">{n.title}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{relTime(n.created_at)}</span>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                    </div>
                  </div>
                  {n.message && <p className="text-xs text-muted-foreground mt-1">{n.message}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Tab config ──────────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'overview',       label: 'Overview',       icon: LayoutDashboard },
    { key: 'invoices',       label: 'Invoices',       icon: Receipt,        badge: invoices.filter(i => i.status === 'Overdue').length || undefined },
    { key: 'documents',      label: 'Documents',      icon: FolderOpen },
    { key: 'projects',       label: 'Projects',       icon: Layers },
    { key: 'support',        label: 'Support',        icon: MessageSquare,  badge: openTickets || undefined },
    { key: 'notifications',  label: 'Notifications',  icon: Bell,           badge: unreadCount || undefined },
  ];

  // ── No company guard ────────────────────────────────────────────────────────
  if (!profile?.company_id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <AlertCircle className="h-7 w-7 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Account not linked</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Your account is not associated with a company yet. Contact your administrator to get access.
          </p>
        </div>
        <a href="mailto:support@crmpro.in" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ExternalLink className="h-3.5 w-3.5" />Contact Support
        </a>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Client Portal</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Track your invoices, documents, projects and support requests.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5 self-start sm:self-auto">
          <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-primary">
            {companyName || 'Your Workspace'}
          </span>
        </div>
      </div>

      {/* ── Welcome banner ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">
          Welcome back, {profile.full_name || 'there'} 👋
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl">
          Here you can track all invoices, shared documents, project timelines and support tickets
          {companyName ? ` for ${companyName}` : ''}.
          Reach out to your account manager for any queries.
        </p>
        <a
          href="mailto:support@crmpro.in"
          className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />Contact Support
        </a>
      </div>

      {/* ── Tab navigation ───────────────────────────────────────────────────── */}
      <div className="border-b border-border overflow-x-auto">
        <nav className="flex gap-0.5 min-w-max">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'relative flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={clsx(
                    'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full text-[10px] font-bold px-1',
                    active ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground',
                  )}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      <div>
        {activeTab === 'overview'       && renderOverview()}
        {activeTab === 'invoices'       && renderInvoices()}
        {activeTab === 'documents'      && renderDocuments()}
        {activeTab === 'projects'       && renderProjects()}
        {activeTab === 'support'        && renderSupport()}
        {activeTab === 'notifications'  && renderNotifications()}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════════════ */}

      {/* New Ticket modal */}
      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewTicket(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">New Support Ticket</h2>
              </div>
              <button onClick={() => setShowNewTicket(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Subject <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={tktForm.subject}
                    onChange={e => setTktForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Briefly describe the issue"
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Description <span className="text-destructive">*</span></label>
                  <textarea
                    value={tktForm.description}
                    onChange={e => setTktForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Provide details about the issue…"
                    rows={4}
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Priority</label>
                  <select
                    value={tktForm.priority}
                    onChange={e => setTktForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl flex-shrink-0">
                <button type="button" onClick={() => setShowNewTicket(false)} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submittingTkt} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {submittingTkt && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submittingTkt ? 'Submitting…' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Document modal (admin/manager only) */}
      {showAddDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddDoc(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Add Document</h2>
              </div>
              <button onClick={() => setShowAddDoc(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddDocument} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Document Name <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={docForm.name}
                    onChange={e => setDocForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Project Proposal Q3"
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Description</label>
                  <input
                    type="text"
                    value={docForm.description}
                    onChange={e => setDocForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Short description of contents"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">File URL <span className="text-destructive">*</span></label>
                  <input
                    type="url"
                    value={docForm.file_url}
                    onChange={e => setDocForm(f => ({ ...f, file_url: e.target.value }))}
                    placeholder="https://drive.google.com/…"
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">File Type</label>
                  <select
                    value={docForm.file_type}
                    onChange={e => setDocForm(f => ({ ...f, file_type: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  >
                    {['PDF', 'Word', 'Excel', 'Image', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl flex-shrink-0">
                <button type="button" onClick={() => setShowAddDoc(false)} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submittingDoc} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {submittingDoc && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submittingDoc ? 'Saving…' : 'Add Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Notification modal (admin/manager only) */}
      {showAddNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddNotif(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Send Notification</h2>
              </div>
              <button onClick={() => setShowAddNotif(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSendNotification} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Title <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={notifForm.title}
                    onChange={e => setNotifForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. System maintenance tonight"
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Message</label>
                  <textarea
                    value={notifForm.message}
                    onChange={e => setNotifForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Additional details (optional)…"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['info', 'success', 'warning', 'alert'] as NotifType[]).map(t => {
                      const Icon = NOTIF_ICONS[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNotifForm(f => ({ ...f, type: t }))}
                          className={clsx(
                            'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors capitalize',
                            notifForm.type === t
                              ? clsx('border-transparent', NOTIF_CARD_STYLES[t])
                              : 'border-border bg-background text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <Icon className="h-4 w-4" />{t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl flex-shrink-0">
                <button type="button" onClick={() => setShowAddNotif(false)} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submittingNotif} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {submittingNotif && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submittingNotif ? 'Sending…' : 'Send Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
