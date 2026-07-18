import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import {
  Webhook, Copy, Check, ExternalLink, Zap, Globe, ShoppingBag,
  Code2, AlertCircle, ArrowRight, MessageCircle, Key, Phone,
  Save, Monitor,
} from 'lucide-react';
import { WA_LS_TOKEN, WA_LS_PHONE_ID } from '@/hooks/useWhatsApp';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEBHOOK_URL = '/api/webhooks/leads';

/** Dynamically build the embed URL from the current browser origin so it works
 *  on both dev (replit.dev) and any deployed domain without hard-coding. */
function getEmbedUrl() {
  const origin = window.location.origin;
  // BASE_URL is e.g. '/crm-dashboard/' — strip trailing slash
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
  return `${origin}${base}/embed/lead-form`;
}

// ─── Integration cards data ───────────────────────────────────────────────────

interface IntegrationCard {
  name:     string;
  icon:     string;
  color:    string;
  steps:    string[];
  docsUrl?: string;
  badge:    string;
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
    name:    'Facebook Ads (Lead Forms)',
    icon:    '📘',
    color:   'bg-blue-50 border-blue-200',
    badge:   'Meta Business Suite',
    steps:   [
      'Open Meta Business Suite → Instant Forms.',
      'Navigate to your lead form → CRM Integration tab.',
      'Choose "Other" under CRM type, then select "Webhook".',
      'Paste the Webhook URL above and click "Test & Save".',
      'Meta will POST new leads to this URL in real time.',
    ],
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/create',
  },
  {
    name:    'Zapier / Pabbly Connect',
    icon:    '⚡',
    color:   'bg-violet-50 border-violet-200',
    badge:   'No-Code Automation',
    steps:   [
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

// ─── Clipboard helper ─────────────────────────────────────────────────────────

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('input');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({
  text,
  label = 'Copy',
  size = 'md',
}: {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all flex-shrink-0',
        copied ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90',
        size === 'md' ? 'px-5 py-3 text-sm min-h-[44px] sm:min-h-0 sm:py-2.5' : 'px-3 py-1.5 text-xs min-h-[32px]',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Integrations() {
  // ── WhatsApp API settings (persisted in localStorage) ──────────────────────
  const [waToken,   setWaToken]   = useState('');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waSaved,   setWaSaved]   = useState(false);

  // Load existing values from localStorage on mount
  useEffect(() => {
    setWaToken(localStorage.getItem(WA_LS_TOKEN)    ?? '');
    setWaPhoneId(localStorage.getItem(WA_LS_PHONE_ID) ?? '');
  }, []);

  const saveWaCredentials = () => {
    if (waToken.trim())   localStorage.setItem(WA_LS_TOKEN,    waToken.trim());
    else                  localStorage.removeItem(WA_LS_TOKEN);
    if (waPhoneId.trim()) localStorage.setItem(WA_LS_PHONE_ID, waPhoneId.trim());
    else                  localStorage.removeItem(WA_LS_PHONE_ID);
    setWaSaved(true);
    setTimeout(() => setWaSaved(false), 2500);
  };

  const embedUrl = getEmbedUrl();
  const iframeSnippet = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="500px"\n  frameborder="0"\n  style="border-radius:12px; border:1px solid #e5e7eb;"\n></iframe>`;

  return (
    <div className="space-y-8">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Webhook className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect external lead sources, embed a public form on your website, and configure WhatsApp
          Cloud API — all from one place.
        </p>
      </div>

      {/* ── Webhook URL card ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Webhook API Endpoint</h2>
          <span className="inline-flex items-center rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold px-2 py-0.5">
            POST
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm text-foreground select-all">
            {WEBHOOK_URL}
          </div>
          <CopyButton text={WEBHOOK_URL} label="Copy URL" />
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Globe  className="h-3.5 w-3.5 text-primary" /> Method: POST</span>
          <span className="flex items-center gap-1.5"><Code2  className="h-3.5 w-3.5 text-primary" /> Content-Type: application/json</span>
          <span className="flex items-center gap-1.5"><Zap    className="h-3.5 w-3.5 text-primary" /> Real-time — no polling needed</span>
        </div>
      </div>

      {/* ── Expected payload ───────────────────────────────────────────────── */}
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
            <strong>Required:</strong>{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">name</code> and{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">phone</code> are mandatory.{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">source</code> must be one of:{' '}
            WhatsApp, Website, IndiaMart, JustDial, Social Media.
          </span>
        </div>
      </div>

      {/* ── Website Integration: embeddable form ───────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Monitor className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Website Integration</h2>
          <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 font-semibold px-2 py-0.5 rounded-full">
            Embeddable Form
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Live preview link */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border bg-muted/20">
            <div>
              <p className="text-sm font-semibold text-foreground">Public Lead Form</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Embed this form on any website. Submissions post directly to your CRM.
              </p>
            </div>
            <a
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
              Preview form
            </a>
          </div>

          {/* Iframe snippet */}
          <div className="px-5 pt-4 pb-3 space-y-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Iframe Embed Snippet
              </span>
              <CopyButton text={iframeSnippet} label="Copy Snippet" size="sm" />
            </div>
            <pre className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs font-mono text-foreground overflow-x-auto leading-relaxed whitespace-pre">
              {iframeSnippet}
            </pre>
          </div>

          {/* Instructions */}
          <div className="px-5 pb-5 pt-1">
            <ol className="space-y-2 text-xs text-muted-foreground">
              {[
                'Copy the snippet above.',
                'Paste it into your website\'s HTML where you want the form to appear.',
                'The form is fully responsive — it adapts to any container width.',
                'Submissions are routed directly into your Leads list as "Website" source.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px] flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── WhatsApp Business API Settings ────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="h-4 w-4 text-[#25D366]" />
          <h2 className="text-base font-semibold text-foreground">WhatsApp Business API Settings</h2>
          <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold px-2 py-0.5 rounded-full">
            Meta Cloud API
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-5">

          {/* Explanation */}
          <div className="flex items-start gap-3 rounded-lg bg-[#25D366]/5 border border-[#25D366]/20 px-4 py-3 text-xs text-foreground">
            <MessageCircle className="h-4 w-4 text-[#128C7E] flex-shrink-0 mt-0.5" />
            <span>
              <strong>How it works:</strong> Once you save a valid API Token, the{' '}
              <em>Send Drip</em> buttons in Leads and Pipeline will send messages
              directly via the WhatsApp Cloud API instead of opening a browser tab.
              A green toast confirms each send. Without a token, the original
              <em> wa.me</em> link behaviour is preserved.
            </span>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Meta API Token */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Meta API Token
              </label>
              <input
                type="password"
                placeholder="EAAxxxxxx…"
                value={waToken}
                onChange={e => setWaToken(e.target.value)}
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                From Meta for Developers → WhatsApp → API Setup → Temporary / Permanent token.
              </p>
            </div>

            {/* Phone Number ID */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone Number ID
              </label>
              <input
                type="text"
                placeholder="1234567890"
                value={waPhoneId}
                onChange={e => setWaPhoneId(e.target.value)}
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                From Meta for Developers → WhatsApp → API Setup → Phone number ID field.
              </p>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={saveWaCredentials}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all min-h-[40px]',
                waSaved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {waSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {waSaved ? 'Saved!' : 'Save Credentials'}
            </button>
            {waToken && (
              <button
                onClick={() => {
                  localStorage.removeItem(WA_LS_TOKEN);
                  localStorage.removeItem(WA_LS_PHONE_ID);
                  setWaToken('');
                  setWaPhoneId('');
                }}
                className="text-xs text-red-500 hover:underline"
              >
                Clear credentials
              </button>
            )}
          </div>

          {/* Status indicator */}
          <div className={clsx(
            'flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium border',
            waToken
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-muted/40 border-border text-muted-foreground',
          )}>
            <span className={clsx(
              'h-2 w-2 rounded-full flex-shrink-0',
              waToken ? 'bg-emerald-500' : 'bg-gray-300',
            )} />
            {waToken
              ? 'API credentials active — drip buttons will send via WhatsApp Cloud API.'
              : 'No credentials saved — drip buttons will open wa.me in a new tab (fallback).'}
          </div>

          {/* Docs link */}
          <a
            href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            WhatsApp Cloud API — Getting Started (Meta Docs)
          </a>
        </div>
      </section>

      {/* ── Integration cards ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Connect Your Lead Sources</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {INTEGRATIONS.map(card => (
            <div key={card.name} className={clsx('rounded-xl border p-5 space-y-4', card.color)}>

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

              {/* Steps */}
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
                onClick={async () => { await copyToClipboard(WEBHOOK_URL); }}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline mt-1"
              >
                <Copy className="h-3 w-3" />
                Copy webhook URL to use above
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
