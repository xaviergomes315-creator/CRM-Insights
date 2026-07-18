import { clsx } from 'clsx';
import {
  Globe, FileText, Layers, Clock, CheckCircle2, AlertCircle,
  Download, ExternalLink, Building2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  description: string;
  amount: string;
  date: string;
  status: 'Paid' | 'Pending' | 'Overdue';
}

interface Project {
  name: string;
  stage: string;
  progress: number;
  lastUpdate: string;
  status: 'On Track' | 'In Review' | 'Completed';
}

// ─── Placeholder data ─────────────────────────────────────────────────────────

const INVOICES: Invoice[] = [
  { id: 'INV-001', description: 'CRM Setup & Onboarding',    amount: '₹25,000', date: '2026-06-01', status: 'Paid'    },
  { id: 'INV-002', description: 'Monthly Retainer — July',   amount: '₹12,000', date: '2026-07-01', status: 'Pending' },
  { id: 'INV-003', description: 'WhatsApp Integration Setup', amount: '₹8,500',  date: '2026-06-15', status: 'Paid'    },
  { id: 'INV-004', description: 'Custom Reporting Module',    amount: '₹15,000', date: '2026-05-20', status: 'Overdue' },
];

const PROJECTS: Project[] = [
  { name: 'CRM Dashboard',         stage: 'Live',            progress: 100, lastUpdate: '2026-07-10', status: 'Completed' },
  { name: 'WhatsApp Automation',   stage: 'Testing',         progress: 75,  lastUpdate: '2026-07-15', status: 'In Review' },
  { name: 'IndiaMart Integration', stage: 'In Development',  progress: 50,  lastUpdate: '2026-07-17', status: 'On Track'  },
  { name: 'Analytics Module',      stage: 'Planning',        progress: 20,  lastUpdate: '2026-07-18', status: 'On Track'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INVOICE_STATUS_STYLES: Record<Invoice['status'], string> = {
  Paid:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-100   text-amber-700   border-amber-200',
  Overdue: 'bg-red-100     text-red-700     border-red-200',
};

const INVOICE_STATUS_ICONS: Record<Invoice['status'], typeof CheckCircle2> = {
  Paid:    CheckCircle2,
  Pending: Clock,
  Overdue: AlertCircle,
};

const PROJECT_STATUS_STYLES: Record<Project['status'], string> = {
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'In Review': 'bg-violet-100 text-violet-700 border-violet-200',
  'On Track':  'bg-blue-100  text-blue-700  border-blue-200',
};

const PROJECT_PROGRESS_COLORS: Record<Project['status'], string> = {
  Completed:   'bg-emerald-500',
  'In Review': 'bg-violet-500',
  'On Track':  'bg-blue-500',
};

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientPortal() {
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Client Portal</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Welcome to the Client Portal — view your invoices and project status at a glance.
          </p>
        </div>

        {/* Brand badge */}
        <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5 self-start sm:self-auto">
          <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-primary">CRM Pro Client View</span>
        </div>
      </div>

      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">Welcome to the Client Portal 👋</h2>
        <p className="text-sm text-muted-foreground max-w-xl">
          Here you can track all your invoices, check live project statuses, and stay up to date
          with the work being done for you. Reach out to your account manager for any queries.
        </p>
        <a
          href="mailto:support@crmpro.in"
          className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Contact Support
        </a>
      </div>

      {/* ── My Invoices ──────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">My Invoices</h2>
          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
            {INVOICES.length}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {INVOICES.map((inv, idx) => {
                  const StatusIcon = INVOICE_STATUS_ICONS[inv.status];
                  return (
                    <tr
                      key={inv.id}
                      className={clsx(
                        'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                        idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                      )}
                    >
                      <td className="px-5 py-4 whitespace-nowrap font-mono text-xs text-muted-foreground">{inv.id}</td>
                      <td className="px-5 py-4 whitespace-nowrap font-medium text-foreground">{inv.description}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">{fmtDate(inv.date)}</td>
                      <td className="px-5 py-4 whitespace-nowrap font-semibold text-foreground">{inv.amount}</td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={clsx(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
                          INVOICE_STATUS_STYLES[inv.status],
                        )}>
                          <StatusIcon className="h-3 w-3" />
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <button
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors min-h-[32px]"
                          onClick={() => alert(`Downloading ${inv.id}… (placeholder)`)}
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Project Status ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Project Status</h2>
          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
            {PROJECTS.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PROJECTS.map(proj => (
            <div
              key={proj.name}
              className="bg-card border border-border rounded-xl p-5 space-y-3 hover:shadow-sm transition-shadow"
            >
              {/* Name + status */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground text-sm">{proj.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Stage: {proj.stage}</p>
                </div>
                <span className={clsx(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border flex-shrink-0',
                  PROJECT_STATUS_STYLES[proj.status],
                )}>
                  {proj.status}
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Progress</span>
                  <span className="font-semibold text-foreground tabular-nums">{proj.progress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-500', PROJECT_PROGRESS_COLORS[proj.status])}
                    style={{ width: `${proj.progress}%` }}
                  />
                </div>
              </div>

              {/* Last update */}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 flex-shrink-0" />
                Last updated: {fmtDate(proj.lastUpdate)}
              </p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
