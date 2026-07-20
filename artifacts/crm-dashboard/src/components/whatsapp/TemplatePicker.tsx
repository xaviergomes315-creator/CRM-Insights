/**
 * TemplatePicker — overlay panel shown when the user clicks the template
 * button in the chat composer. Two-screen flow:
 *   1. List  — searchable list of approved templates
 *   2. Configure — variable inputs + live preview → Confirm
 */
import { useState, useEffect, useCallback } from 'react';
import {
  X, ArrowLeft, RefreshCw, Loader2,
  Search, Send, AlertCircle, LayoutTemplate,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import {
  type WaTemplate,
  type WaTemplateCategory,
  fetchTemplates,
  syncTemplates,
  extractTemplateVars,
  renderTemplateBody,
} from '@/lib/whatsapp-api';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TemplatePickerProps {
  token:     string;
  onConfirm: (templateId: string, templateName: string, renderedBody: string, params: string[]) => void;
  onClose:   () => void;
  disabled:  boolean;
}

type Screen = 'list' | 'configure';

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<WaTemplateCategory, string> = {
  UTILITY:        'Utility',
  MARKETING:      'Marketing',
  AUTHENTICATION: 'Auth',
};

const CATEGORY_COLORS: Record<WaTemplateCategory, string> = {
  UTILITY:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  MARKETING:      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  AUTHENTICATION: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

// ── TemplatePreview ────────────────────────────────────────────────────────────
// Renders a bubble-like preview where unfilled {{n}} placeholders are amber,
// and filled values appear as bolded green text.

function TemplatePreview({
  bodyText, footerText, params,
}: {
  bodyText:   string;
  footerText: string;
  params:     string[];
}) {
  const segments = bodyText.split(/(\{\{\d+\}\})/);

  return (
    <div className="rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 px-3.5 py-3">
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
        {segments.map((seg, i) => {
          const m = seg.match(/^\{\{(\d+)\}\}$/);
          if (!m) return <span key={i}>{seg}</span>;
          const val = params[parseInt(m[1], 10) - 1]?.trim();
          return val
            ? <strong key={i} className="font-semibold text-[#0e6b3e] dark:text-[#34d072]">{val}</strong>
            : <span  key={i} className="rounded bg-amber-100 px-0.5 text-amber-700 font-mono text-xs dark:bg-amber-900/40 dark:text-amber-400">{seg}</span>;
        })}
      </p>
      {footerText && (
        <p className="mt-2 text-[11px] text-muted-foreground border-t border-border/40 pt-1.5 leading-relaxed">
          {footerText}
        </p>
      )}
    </div>
  );
}

// ── TemplatePicker ─────────────────────────────────────────────────────────────

export default function TemplatePicker({ token, onConfirm, onClose, disabled }: TemplatePickerProps) {
  const { profile } = useAuth();
  const isManager = ['super_admin', 'company_admin', 'manager'].includes(profile?.role ?? '');

  // ── State ──────────────────────────────────────────────────────────────────
  const [screen,    setScreen]    = useState<Screen>('list');
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg,   setSyncMsg]   = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState<WaTemplate | null>(null);
  const [params,    setParams]    = useState<string[]>([]);

  // ── Load approved templates ────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { templates: list } = await fetchTemplates(token);
      setTemplates(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load templates.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ── Sync ───────────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMsg(null);
    setLoadError(null);
    try {
      const result = await syncTemplates(token);
      setSyncMsg(
        `Synced ${result.synced} template${result.synced !== 1 ? 's' : ''} ` +
        `(${result.added} new, ${result.updated} updated)`,
      );
      await loadTemplates();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Template selection ─────────────────────────────────────────────────────

  const handleSelect = (tpl: WaTemplate) => {
    const vars  = extractTemplateVars(tpl.body_text);
    const count = vars.length > 0 ? Math.max(...vars) : 0;
    setSelected(tpl);
    setParams(new Array(count).fill(''));
    setScreen('configure');
    setSyncMsg(null);
  };

  // ── Confirm send ───────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!selected) return;
    const rendered = renderTemplateBody(selected.body_text, params);
    onConfirm(selected.id, selected.name, rendered, params);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const vars        = selected ? extractTemplateVars(selected.body_text) : [];
  const maxVarIdx   = vars.length > 0 ? Math.max(...vars) : 0;
  const allFilled   = vars.every(i => (params[i - 1] ?? '').trim() !== '');
  const canConfirm  = !disabled && (maxVarIdx === 0 || allFilled);

  const filtered = templates.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.body_text.toLowerCase().includes(q);
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-card">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-border bg-card shadow-sm">

        {/* Back / Close button */}
        {screen === 'configure' ? (
          <button
            onClick={() => setScreen('list')}
            aria-label="Back to templates"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={onClose}
            aria-label="Close template picker"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          {screen === 'list' ? (
            <>
              <p className="text-sm font-semibold text-foreground">Templates</p>
              {!isLoading && (
                <p className="text-xs text-muted-foreground">
                  {templates.length} approved template{templates.length !== 1 ? 's' : ''}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground font-mono truncate">
                {selected?.name}
              </p>
              {selected && (
                <span className={clsx(
                  'inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                  CATEGORY_COLORS[selected.category],
                )}>
                  {CATEGORY_LABELS[selected.category]} · {selected.language}
                </span>
              )}
            </>
          )}
        </div>

        {/* Sync button (managers only, list screen only) */}
        {screen === 'list' && isManager && (
          <button
            onClick={handleSync}
            disabled={isSyncing || isLoading}
            title="Pull latest templates from Meta"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            Sync
          </button>
        )}
      </div>

      {/* ── List screen ─────────────────────────────────────────────────────── */}
      {screen === 'list' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Search */}
          <div className="flex-shrink-0 px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                placeholder="Search templates…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/40 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                autoFocus
              />
            </div>
          </div>

          {/* Sync success message */}
          {syncMsg && (
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-xs text-[#0e6b3e] dark:text-[#34d072] leading-relaxed">
              ✓ {syncMsg}
            </div>
          )}

          {/* Error banner */}
          {loadError && (
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">{loadError}</p>
              <button
                onClick={loadTemplates}
                className="ml-auto text-xs text-destructive underline flex-shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Template list */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {isLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && !loadError && templates.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                  <LayoutTemplate className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No approved templates</p>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
                  {isManager
                    ? 'Click Sync to import approved templates from your Meta account.'
                    : 'Ask a manager to sync templates from the Meta Business account.'}
                </p>
              </div>
            )}

            {!isLoading && templates.length > 0 && filtered.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No templates match "{search}".
              </p>
            )}

            {!isLoading && filtered.length > 0 && (
              <div className="space-y-2 pt-1">
                {filtered.map(tpl => {
                  const varCount = extractTemplateVars(tpl.body_text).length;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => handleSelect(tpl)}
                      className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 hover:border-primary/30 px-3.5 py-3 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-mono font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {tpl.name}
                        </p>
                        <span className={clsx(
                          'flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          CATEGORY_COLORS[tpl.category],
                        )}>
                          {CATEGORY_LABELS[tpl.category]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {tpl.body_text}
                      </p>
                      <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                        {tpl.language} · {varCount} variable{varCount !== 1 ? 's' : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Configure screen ─────────────────────────────────────────────────── */}
      {screen === 'configure' && selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

            {/* Live preview */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Preview
              </p>
              <TemplatePreview
                bodyText={selected.body_text}
                footerText={selected.footer_text}
                params={params}
              />
              {selected.buttons.length > 0 && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  + {selected.buttons.length} button{selected.buttons.length !== 1 ? 's' : ''} (sent automatically)
                </p>
              )}
            </div>

            {/* Variable inputs */}
            {maxVarIdx > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Variables
                </p>
                {Array.from({ length: maxVarIdx }, (_, i) => i + 1).map(n => (
                  <div key={n}>
                    <label
                      htmlFor={`tpl-var-${n}`}
                      className="flex items-center gap-1 text-xs font-medium text-foreground mb-1.5"
                    >
                      <span className="font-mono text-muted-foreground text-[10px] bg-muted px-1.5 py-0.5 rounded">
                        {`{{${n}}}`}
                      </span>
                      Variable {n}
                      <span className="text-destructive">*</span>
                    </label>
                    <input
                      id={`tpl-var-${n}`}
                      type="text"
                      value={params[n - 1] ?? ''}
                      onChange={e => {
                        const next = [...params];
                        next[n - 1] = e.target.value;
                        setParams(next);
                      }}
                      placeholder={`Value for {{${n}}}…`}
                      autoFocus={n === 1}
                      className="w-full rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* No-variable notice */}
            {maxVarIdx === 0 && (
              <p className="text-xs text-center text-muted-foreground py-2">
                This template has no variables — it will be sent exactly as shown above.
              </p>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex-shrink-0 border-t border-border px-4 py-3 flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={disabled}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all',
                canConfirm
                  ? 'bg-[#25D366] hover:bg-[#1ebe5d] text-white shadow-sm'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {disabled ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
              ) : (
                <><Send className="h-4 w-4" />Send Template</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
