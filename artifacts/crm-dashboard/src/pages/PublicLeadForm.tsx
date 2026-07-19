/**
 * PublicLeadForm — embeddable, public-facing lead capture form.
 *
 * ✅ No authentication required.
 * ✅ No sidebar / navbar — clean standalone UI suitable for <iframe> embed.
 * ✅ POSTs to /api/webhooks/leads (same endpoint used by IndiaMart / Zapier).
 * ✅ Shows a full-page success state on submission.
 *
 * Route: /embed/lead-form  (added OUTSIDE <ProtectedRoute> in App.tsx)
 */
import { useState } from 'react';
import { clsx } from 'clsx';
import { Building2, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

const SOURCES = ['Website', 'WhatsApp', 'IndiaMart', 'JustDial', 'Social Media', 'Other'] as const;
type Source = (typeof SOURCES)[number];

interface FormState {
  name:   string;
  phone:  string;
  email:  string;
  source: Source;
}

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

// ─── Shared input class ───────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm ' +
  'text-gray-900 placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ' +
  'transition-colors';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicLeadForm() {
  const [form, setForm] = useState<FormState>({
    name:   '',
    phone:  '',
    email:  '',
    source: 'Website',
  });
  const [status, setStatus] = useState<SubmitStatus>('idle');

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/webhooks/leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (res.ok || res.status === 201) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  const set = <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value as FormState[K] }));

  // ── Success state ───────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4">
        <div className="max-w-sm w-full text-center space-y-5 animate-in fade-in duration-300">
          <div className="flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Thank You!</h2>
            <p className="text-base text-gray-600">
              We have received your details.
            </p>
            <p className="text-sm text-gray-500">
              Our team will get back to you shortly. 🎯
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Submitted securely
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="max-w-md w-full">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">

          {/* Top accent */}
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

          <div className="p-8 space-y-6">

            {/* Brand + heading */}
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-2 mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-gray-900">CRM Pro</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Get in Touch</h1>
              <p className="text-sm text-gray-500">
                Fill in your details and we'll reach out shortly.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="e.g. Priya Sharma"
                  value={form.name}
                  onChange={set('name')}
                  className={INPUT_CLASS}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98001 XXXXX"
                  value={form.phone}
                  onChange={set('phone')}
                  className={INPUT_CLASS}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                  <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="priya@example.com"
                  value={form.email}
                  onChange={set('email')}
                  className={INPUT_CLASS}
                />
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  How did you find us?
                </label>
                <select
                  value={form.source}
                  onChange={set('source')}
                  className={INPUT_CLASS}
                >
                  {SOURCES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Error */}
              {status === 'error' && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                  Something went wrong. Please try again or contact us directly.
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={status === 'loading'}
                className={clsx(
                  'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all min-h-[44px]',
                  'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                )}
              >
                {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                {status === 'loading' ? 'Submitting…' : 'Submit Enquiry →'}
              </button>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Your information is secure and never shared with third parties.
            </div>

          </div>
        </div>

        {/* Powered by */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by <span className="font-semibold text-gray-500">CRM Pro</span>
        </p>
      </div>
    </div>
  );
}
