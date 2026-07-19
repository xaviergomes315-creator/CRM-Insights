import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { Building2, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ─── Demo credentials shown on the page ──────────────────────────────────────

const DEMO_ACCOUNTS = [
  { email: 'admin@test.com',      password: 'admin123', role: 'Admin',      color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { email: 'telecaller@test.com', password: 'tele123',  role: 'Telecaller', color: 'bg-amber-50 border-amber-200 text-amber-700'       },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const location = useLocation();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Already logged in — redirect to wherever they came from (or home)
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
  if (isAuthenticated) return <Navigate to={from} replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) setError(result.error ?? 'Login failed.');
  };

  const fillDemo = (acc: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError('');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">CRM Pro</h1>
            <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6 space-y-5">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={clsx(
                  'w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground',
                  'placeholder:text-muted-foreground outline-none transition-colors',
                  'focus:ring-2 focus:ring-primary/30 focus:border-primary',
                  error ? 'border-destructive' : 'border-border',
                )}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={clsx(
                    'w-full rounded-lg border bg-background px-3 py-3 pr-10 text-sm text-foreground',
                    'placeholder:text-muted-foreground outline-none transition-colors',
                    'focus:ring-2 focus:ring-primary/30 focus:border-primary',
                    error ? 'border-destructive' : 'border-border',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground font-semibold py-3 text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-h-[44px]"
            >
              {loading ? (
                <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">Demo accounts</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Demo credential cards */}
          <div className="grid grid-cols-2 gap-3">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fillDemo(acc)}
                className={clsx(
                  'flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all hover:shadow-sm active:scale-[0.98]',
                  acc.color,
                )}
              >
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 flex-shrink-0" />
                  <span className="text-xs font-semibold">{acc.role}</span>
                </div>
                <span className="text-[11px] opacity-80 break-all">{acc.email}</span>
                <span className="text-[11px] font-mono opacity-70">{acc.password}</span>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Click a card to auto-fill credentials, then sign in.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Secured with role-based access control.
        </p>
      </div>
    </div>
  );
}
