import { useState } from 'react';
import { clsx } from 'clsx';
import {
  Webhook, Copy, Check, ExternalLink, Zap, Globe, ShoppingBag,
  Code2, AlertCircle, ArrowRight,
} from 'lucide-react';

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

const WEBHOOK_URL = '/api/webhooks/leads';

// ─── Integration cards ────────────────────────────────────────────────────────

interface IntegrationCard {
  name:    string;
  icon:    string;         // emoji fallback
  color:   string;
  steps:   string[];
  docsUrl?: string;
  badge:   string;
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    name:  'IndiaMart',
    icon:  '🏭',
    color: 'bg-orange-50 border-orange-200',
    badge: 'Most Popular',
    steps: [
      'Log in to your IndiaMart Seller Dashboard.',
      'Go to Settings → Lead Manager → CRM Integration.',
      'Select "Custom Webhook" as the integration type.',
      'Paste the Webhook URL above into the endpoint field.',
      'Set the method to POST and save. New leads will arrive automatically.',
    ],
  },
  {
    name:  'Facebook Ads (Lead Forms)',
    icon:  '📘',
    color: 'bg-blue-50 border-blue-200',
    badge: 'Meta Business Suite',
    steps: [
      'Open Meta Business Suite → Instant Forms.',
      'Navigate to your lead form → CRM Integration tab.',
      'Choose "Other" under CRM type, then select "Webhook".',
      'Paste the Webhook URL above and click "Test & Save".',
      'Meta will POST new leads to this URL in real time.',
    ],
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create',
  },
  {
    name:  'Zapier / Pabbly Connect',
    icon:  '⚡',
    color: 'bg-violet-50 border-violet-200',
    badge: 'No-Code Automation',
    steps: [
      'Open Zapier or Pabbly Connect and create a new workflow.',
      'Set the Trigger app to your lead source (e.g. Google Ads, Typeform).',
      'Add a "Webhooks" action step and choose "POST".',
      'Paste the Webhook URL above as the endpoint.',
      'Map the lead fields (name, phone, email, source) and publish the workflow.',
    ],
    docsUrl: 'https://zapier.com/apps/webhook/integrations',
  },
];

// ─── Expected payload ─────────────────────────────────────────────────────────

const SAMPLE_PAYLOAD = JSON.stringify(
  { name: 'Priya Sharma', phone: '+91 98001 11111', email: 'priya@example.com', source: 'IndiaMart' },
  null,
  2,
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Integrations() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('input');
      el.value = WEBHOOK_URL;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Webhook className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect external lead sources to CRM Pro using the webhook endpoint below.
          New leads arrive instantly and are automatically set to <strong>New</strong> status.
        </p>
      </div>

      {/* Webhook URL card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Webhook API Endpoint</h2>
          <span className="inline-flex items-center rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold px-2 py-0.5">
            POST
          </span>
        </div>

        {/* URL + copy */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm text-foreground select-all">
            {WEBHOOK_URL}
          </div>
          <button
            onClick={handleCopy}
            className={clsx(
              'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all min-h-[44px] sm:min-h-0 sm:py-2.5 flex-shrink-0',
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>

        {/* Info chips */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Globe   className="h-3.5 w-3.5 text-primary" /> Method: POST</span>
          <span className="flex items-center gap-1.5"><Code2   className="h-3.5 w-3.5 text-primary" /> Content-Type: application/json</span>
          <span className="flex items-center gap-1.5"><Zap     className="h-3.5 w-3.5 text-primary" /> Real-time — no polling needed</span>
        </div>
      </div>

      {/* Expected payload */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/30">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Expected JSON Payload</span>
        </div>
        <pre className="px-5 py-4 text-xs font-mono text-foreground overflow-x-auto leading-relaxed">
          {SAMPLE_PAYLOAD}
        </pre>
        <div className="flex items-start gap-2 px-5 py-3 border-t border-border bg-amber-50/60 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Required:</strong> <code className="font-mono bg-amber-100 px-1 rounded">name</code> and{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">phone</code> are mandatory.{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">source</code> must be one of:{' '}
            WhatsApp, Website, IndiaMart, JustDial, Social Media.
          </span>
        </div>
      </div>

      {/* Integration cards */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Connect Your Lead Sources
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {INTEGRATIONS.map(card => (
            <div
              key={card.name}
              className={clsx('rounded-xl border p-5 space-y-4', card.color)}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl leading-none">{card.icon}</span>
                  <div>
                    <p className="font-bold text-foreground text-sm">{card.name}</p>
                    <span className="text-xs text-muted-foreground">{card.badge}</span>
                  </div>
                </div>
                {card.docsUrl && (
                  <a
                    href={card.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-background/60 transition-colors flex-shrink-0"
                    title="Official docs"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {/* Step list */}
              <ol className="space-y-2.5">
                {card.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-foreground/80">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/80 border border-border text-xs font-bold text-primary flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>

              {/* CTA */}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline mt-1"
              >
                <Copy className="h-3 w-3" />
                Copy webhook URL to use above
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
