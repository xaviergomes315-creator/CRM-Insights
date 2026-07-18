import { useState } from 'react';
import { clsx } from 'clsx';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { TrendingUp, Users, CheckCircle, Clock, BarChart2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type LeadSource = 'WhatsApp' | 'Website' | 'IndiaMart' | 'JustDial' | 'Social Media';
type LeadStatus = 'New' | 'Contacted' | 'Closed';

interface Lead {
  source: LeadSource;
  status: LeadStatus;
}

// ─── Data (mirrors LeadsPage initial state) ──────────────────────────────────

const LEADS: Lead[] = [
  { source: 'IndiaMart',    status: 'New'       },
  { source: 'WhatsApp',     status: 'Contacted' },
  { source: 'Website',      status: 'Closed'    },
  { source: 'JustDial',     status: 'New'       },
  { source: 'Social Media', status: 'Contacted' },
  { source: 'IndiaMart',    status: 'New'       },
  { source: 'Website',      status: 'Closed'    },
  { source: 'WhatsApp',     status: 'New'       },
  { source: 'Social Media', status: 'Contacted' },
  { source: 'JustDial',     status: 'New'       },
];

// ─── Source palette ───────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<LeadSource, string> = {
  WhatsApp:      '#22c55e',
  Website:       '#a855f7',
  IndiaMart:     '#f97316',
  JustDial:      '#06b6d4',
  'Social Media':'#ec4899',
};

const SOURCE_BADGE: Record<LeadSource, string> = {
  WhatsApp:      'bg-green-100 text-green-700 border border-green-200',
  Website:       'bg-purple-100 text-purple-700 border border-purple-200',
  IndiaMart:     'bg-orange-100 text-orange-700 border border-orange-200',
  JustDial:      'bg-cyan-100 text-cyan-700 border border-cyan-200',
  'Social Media':'bg-pink-100 text-pink-700 border border-pink-200',
};

// ─── Computed Data ────────────────────────────────────────────────────────────

function buildSourceData(leads: Lead[]) {
  const counts: Partial<Record<LeadSource, number>> = {};
  leads.forEach(l => { counts[l.source] = (counts[l.source] ?? 0) + 1; });
  return Object.entries(counts).map(([source, value]) => ({
    name: source as LeadSource,
    value: value as number,
    percent: Math.round(((value as number) / leads.length) * 100),
    color: SOURCE_COLORS[source as LeadSource],
  }));
}

function buildStatusData(leads: Lead[]) {
  const order: LeadStatus[] = ['New', 'Contacted', 'Closed'];
  const colors: Record<LeadStatus, string> = {
    New:       '#3b82f6',
    Contacted: '#f59e0b',
    Closed:    '#10b981',
  };
  const counts: Partial<Record<LeadStatus, number>> = {};
  leads.forEach(l => { counts[l.status] = (counts[l.status] ?? 0) + 1; });
  return order.map(s => ({ name: s, value: counts[s] ?? 0, fill: colors[s] }));
}

// ─── Custom Pie Label ────────────────────────────────────────────────────────

interface PieLabelProps {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number;
  percent: number;
}

function CustomPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelProps) {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = Math.round((value / LEADS.length) * 100);
  return (
    <div className="rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{name}</p>
      <p className="text-muted-foreground">{value} leads · {pct}%</p>
    </div>
  );
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground">{payload[0].value} leads</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const sourceData = buildSourceData(LEADS);
  const statusData = buildStatusData(LEADS);

  const totalLeads   = LEADS.length;
  const newLeads     = LEADS.filter(l => l.status === 'New').length;
  const contacted    = LEADS.filter(l => l.status === 'Contacted').length;
  const closed       = LEADS.filter(l => l.status === 'Closed').length;
  const convRate     = Math.round((closed / totalLeads) * 100);

  const summaryCards = [
    { label: 'Total Leads',      value: totalLeads, sub: 'All sources',          icon: Users,       color: 'text-primary'       },
    { label: 'New Leads',        value: newLeads,   sub: 'Awaiting contact',     icon: TrendingUp,  color: 'text-blue-600'      },
    { label: 'Contacted',        value: contacted,  sub: 'Follow-up in progress', icon: Clock,       color: 'text-amber-600'     },
    { label: 'Conversion Rate',  value: `${convRate}%`, sub: `${closed} closed`, icon: CheckCircle, color: 'text-emerald-600'   },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Lead source tracking and performance overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-border bg-card shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <Icon className={clsx('h-4 w-4', c.color)} />
              </div>
              <p className={clsx('text-2xl font-bold', c.color)}>{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Pie chart: Leads by Source ── */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Leads by Source</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Percentage of leads from each acquisition channel</p>

          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={sourceData}
                cx="50%"
                cy="50%"
                outerRadius={110}
                dataKey="value"
                labelLine={false}
                label={CustomPieLabel}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {sourceData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 12, color: '#64748b' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Source breakdown table */}
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {sourceData.sort((a, b) => b.value - a.value).map(d => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', SOURCE_BADGE[d.name])}>
                  {d.name}
                </span>
                <div className="flex-1 mx-2">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${d.percent}%`, backgroundColor: d.color }}
                    />
                  </div>
                </div>
                <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">{d.percent}%</span>
                <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{d.value} leads</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bar chart: Leads by Status ── */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Leads by Status</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Current pipeline stage distribution</p>

          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statusData} barSize={36} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {statusData.map(entry => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Status legend */}
          <div className="mt-6 space-y-3 border-t border-border pt-4">
            {statusData.map(d => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                  <span className="text-sm text-foreground">{d.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round((d.value / totalLeads) * 100)}%`, backgroundColor: d.fill }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground tabular-nums w-6 text-right">{d.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Source breakdown cards */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Source Breakdown
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {sourceData.sort((a, b) => b.value - a.value).map(d => (
            <div key={d.name} className="rounded-xl border border-border bg-card shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', SOURCE_BADGE[d.name])}>
                  {d.name}
                </span>
                <span className="text-xs font-bold" style={{ color: d.color }}>{d.percent}%</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{d.value}</p>
              <p className="text-xs text-muted-foreground">lead{d.value !== 1 ? 's' : ''}</p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${d.percent}%`, backgroundColor: d.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
