import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Phone, MoreVertical,
  Check, CheckCheck, Clock, AlertCircle,
  Send, Loader2, RefreshCw, ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import {
  type WaConversation,
  type WaMessage,
  type WaMsgStatus,
  contactInitials,
  messageTime,
  dateSeparator,
  fetchMessages,
  sendMessage,
} from '@/lib/whatsapp-api';
import { useMessagesRealtime } from '@/hooks/useWhatsAppRealtime';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 50;
const NEAR_BOTTOM_PX = 150; // px from bottom to auto-scroll on new message

// ── Status tick icon ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: WaMsgStatus }) {
  switch (status) {
    case 'pending':   return <Clock       className="h-3 w-3 text-white/60"  />;
    case 'sent':      return <Check       className="h-3 w-3 text-white/70"  />;
    case 'delivered': return <CheckCheck  className="h-3 w-3 text-white/70"  />;
    case 'read':      return <CheckCheck  className="h-3 w-3 text-blue-200"  />;
    case 'failed':    return <AlertCircle className="h-3 w-3 text-red-300"   />;
    default:          return null;
  }
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: WaMessage }) {
  const outgoing = msg.direction === 'outgoing';
  const isOptimistic = msg.id.startsWith('optimistic-');

  return (
    <div className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'relative max-w-[75%] sm:max-w-[65%] rounded-2xl px-3.5 py-2.5 shadow-sm transition-opacity',
          outgoing
            ? 'bg-[#25D366] text-white rounded-br-sm'
            : 'bg-card border border-border text-foreground rounded-bl-sm',
          isOptimistic && 'opacity-70',
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {msg.body || <span className="italic opacity-60">[{msg.message_type}]</span>}
        </p>

        <div className={clsx('flex items-center gap-1 mt-1', outgoing ? 'justify-end' : 'justify-start')}>
          <span className={clsx('text-[10px]', outgoing ? 'text-white/60' : 'text-muted-foreground')}>
            {messageTime(msg.created_at)}
          </span>
          {outgoing && <StatusIcon status={msg.status} />}
        </div>

        {msg.status === 'failed' && msg.error_message && (
          <p className="mt-1 text-[10px] text-red-300 leading-tight">{msg.error_message}</p>
        )}
      </div>
    </div>
  );
}

// ── Date separator ────────────────────────────────────────────────────────────

function DateSep({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap px-2 py-0.5 rounded-full bg-muted border border-border">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  conversation:  WaConversation;
  token:         string;
  onBack:        () => void;
  onMessageSent: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatWindow({ conversation, token, onBack, onMessageSent }: Props) {
  const { profile } = useAuth();
  const companyId   = profile?.company_id ?? null;

  const [messages,       setMessages]       = useState<WaMessage[]>([]);
  const [total,          setTotal]          = useState(0);
  const [earliestOffset, setEarliestOffset] = useState<number | null>(null);
  const [isLoading,      setIsLoading]      = useState(true);
  const [loadingOlder,   setLoadingOlder]   = useState(false);
  const [fetchError,     setFetchError]     = useState<string | null>(null);
  const [draft,          setDraft]          = useState('');
  const [sending,        setSending]        = useState(false);
  const [sendError,      setSendError]      = useState<string | null>(null);
  // Count of new messages that arrived while the user is scrolled up
  const [unreadCount,    setUnreadCount]    = useState(0);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll helpers ────────────────────────────────────────────────────────

  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  };

  const handleScroll = () => {
    if (isNearBottom() && unreadCount > 0) setUnreadCount(0);
  };

  // ── Load initial messages (most recent PAGE_SIZE) ─────────────────────────

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    setMessages([]);
    setEarliestOffset(null);
    setUnreadCount(0);

    try {
      const meta = await fetchMessages(token, conversation.id, 0, 1);
      const t    = meta.total;
      setTotal(t);

      if (t === 0) {
        setEarliestOffset(0);
        setIsLoading(false);
        return;
      }

      const offset = Math.max(0, t - PAGE_SIZE);
      const page   = await fetchMessages(token, conversation.id, offset, PAGE_SIZE);
      setMessages(page.messages);
      setEarliestOffset(offset);
      setIsLoading(false);

      // Jump to bottom instantly on first load
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load messages.');
      setIsLoading(false);
    }
  }, [token, conversation.id]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // ── Load older messages (IntersectionObserver at top) ────────────────────

  const loadOlder = useCallback(async () => {
    if (loadingOlder || earliestOffset === null || earliestOffset <= 0) return;
    setLoadingOlder(true);

    const prevHeight = scrollRef.current?.scrollHeight ?? 0;
    const newOffset  = Math.max(0, earliestOffset - PAGE_SIZE);
    const batchSize  = earliestOffset - newOffset;

    try {
      const page = await fetchMessages(token, conversation.id, newOffset, batchSize);
      setMessages(prev => [...page.messages, ...prev]);
      setEarliestOffset(newOffset);

      requestAnimationFrame(() => {
        if (scrollRef.current)
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
      });
    } catch (err) {
      console.error('[ChatWindow] loadOlder:', err);
    } finally {
      setLoadingOlder(false);
    }
  }, [token, conversation.id, earliestOffset, loadingOlder]);

  const hasOlderMessages = earliestOffset !== null && earliestOffset > 0;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasOlderMessages) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadOlder(); },
      { root: scrollRef.current, threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasOlderMessages, loadOlder]);

  // ── Realtime: incoming messages + status updates ──────────────────────────
  //
  // onInsert — called for every new DB row in this conversation.
  //   • Skip if the id is already present (race: API response beat realtime).
  //   • Auto-scroll when the user is near the bottom; show badge otherwise.
  //
  // onUpdate — called when a row's columns change (e.g. status pending→sent).
  //   • Patch the matching message in place; no scroll needed.

  const handleRealtimeInsert = useCallback((msg: WaMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev; // already present
      return [...prev, msg];
    });
    setTotal(t => t + 1);

    if (isNearBottom()) {
      scrollToBottom('smooth');
    } else if (msg.direction === 'incoming') {
      // Only badge for incoming — outgoing from another agent session is
      // less urgent from the current user's perspective.
      setUnreadCount(c => c + 1);
    }
  }, []); // deps intentionally empty: reads refs/scrollRef at call-time

  const handleRealtimeUpdate = useCallback((msg: WaMessage) => {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
  }, []);

  useMessagesRealtime(conversation.id, companyId, handleRealtimeInsert, handleRealtimeUpdate);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setSendError(null);
    setDraft('');

    // Resize textarea back to one row
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Optimistic insert — shown immediately while the API call is in-flight
    const optimisticId  = `optimistic-${Date.now()}`;
    const optimistic: WaMessage = {
      id:                optimisticId,
      conversation_id:   conversation.id,
      direction:         'outgoing',
      message_type:      'text',
      body,
      media_url:         null,
      media_mime_type:   null,
      media_filename:    null,
      template_name:     null,
      template_params:   null,
      status:            'pending',
      status_updated_at: null,
      error_code:        null,
      error_message:     null,
      external_id:       null,
      sent_by:           null,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimistic]);
    scrollToBottom('instant' as ScrollBehavior);

    try {
      const { message: real } = await sendMessage(token, { conversationId: conversation.id, body });

      // Race-safe replacement:
      // • If realtime INSERT beat the API response, `real.id` already exists
      //   in the list — just drop the optimistic; don't duplicate.
      // • Otherwise swap optimistic for real.
      setMessages(prev => {
        const hasReal = prev.some(m => m.id === real.id);
        if (hasReal) return prev.filter(m => m.id !== optimisticId);
        return prev.map(m => m.id === optimisticId ? real : m);
      });

      setTotal(t => t + 1);
      onMessageSent();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message.');
      setMessages(prev => prev.map(m =>
        m.id === optimisticId
          ? { ...m, status: 'failed' as WaMsgStatus, error_message: String(err) }
          : m,
      ));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  };

  // ── Build row list with date separators ───────────────────────────────────

  const rows: Array<{ type: 'sep'; label: string } | { type: 'msg'; msg: WaMessage }> = [];
  let lastDay = '';
  for (const msg of messages) {
    const day = dateSeparator(msg.created_at);
    if (day !== lastDay) { rows.push({ type: 'sep', label: day }); lastDay = day; }
    rows.push({ type: 'msg', msg });
  }

  const initials = contactInitials(conversation);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full relative">

      {/* ── Contact header ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card shadow-sm z-10">
        <button
          onClick={onBack}
          className="md:hidden -ml-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {conversation.contact_name ?? conversation.contact_phone}
          </p>
          {conversation.contact_name && (
            <p className="text-xs text-muted-foreground font-mono">{conversation.contact_phone}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button disabled className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground" title="Call (coming soon)">
            <Phone className="h-4 w-4" />
          </button>
          <button disabled className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground" title="More options">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Messages area ────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.02\'%3E%3Cpath d=\'m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30v4h-4v2h4v4h2v-4h4v-2h-4v-4h-2zm-24 18v4h-4v2h4v4h2v-4h4v-2h-4v-4h-2z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]"
      >
        {/* Top sentinel for loading older messages */}
        <div ref={sentinelRef} className="h-1" />

        {loadingOlder && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasOlderMessages && !loadingOlder && (
          <div className="flex justify-center py-2">
            <button
              onClick={loadOlder}
              className="text-xs text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20 hover:bg-primary/15 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Load older messages
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          </div>
        )}

        {!isLoading && fetchError && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{fetchError}</p>
            <button onClick={loadInitial} className="text-xs text-primary underline">Retry</button>
          </div>
        )}

        {!isLoading && !fetchError && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-48 text-center">
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">
              Send the first message to {conversation.contact_name ?? conversation.contact_phone}.
            </p>
          </div>
        )}

        {!isLoading && !fetchError && rows.map((row, i) =>
          row.type === 'sep'
            ? <DateSep key={`sep-${i}`} label={row.label} />
            : <MessageBubble key={row.msg.id} msg={row.msg} />,
        )}

        <div className="h-1" />
      </div>

      {/* ── "New messages" scroll-down badge ────────────────────────────── */}
      {unreadCount > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => { scrollToBottom(); setUnreadCount(0); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-semibold shadow-lg hover:bg-[#1ebe5d] transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {unreadCount} new message{unreadCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* ── Send error banner ────────────────────────────────────────────── */}
      {sendError && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <p className="text-xs text-destructive">{sendError}</p>
          <button onClick={() => setSendError(null)} className="text-xs text-destructive underline flex-shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Message composer ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border bg-card px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            maxLength={4096}
            disabled={sending}
            className="flex-1 resize-none rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-60 leading-relaxed overflow-hidden"
            style={{ minHeight: '2.75rem', maxHeight: '140px' }}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className={clsx(
              'flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center transition-all',
              draft.trim() && !sending
                ? 'bg-[#25D366] hover:bg-[#1ebe5d] text-white shadow-sm'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {sending
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <Send    className="h-5 w-5 translate-x-px" />
            }
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">
          Enter to send · Shift+Enter for new line · {draft.length}/4096
        </p>
      </div>
    </div>
  );
}
