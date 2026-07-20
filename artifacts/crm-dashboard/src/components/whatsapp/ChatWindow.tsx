import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Phone, MoreVertical,
  Check, CheckCheck, Clock, AlertCircle,
  Send, Loader2, RefreshCw, ChevronDown,
  Paperclip, X, FileText, Music2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import {
  type WaConversation,
  type WaMessage,
  type WaMsgStatus,
  type WaMsgType,
  contactInitials,
  messageTime,
  dateSeparator,
  fetchMessages,
  sendMessage,
  markConversationSeen,
  requestUploadUrl,
  uploadFileToStorage,
} from '@/lib/whatsapp-api';
import { useMessagesRealtime } from '@/hooks/useWhatsAppRealtime';

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 50;
const NEAR_BOTTOM_PX = 150;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/mp4',
  'video/mp4', 'video/3gpp', 'video/quicktime',
].join(',');

// ── Small helpers ──────────────────────────────────────────────────────────────

function detectMsgType(file: File): WaMsgType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

function formatBytes(n: number): string {
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function mimeLabel(mimeType: string | null): string {
  if (!mimeType) return 'File';
  if (mimeType.includes('pdf'))               return 'PDF';
  if (mimeType.includes('wordprocessingml'))  return 'Word';
  if (mimeType.startsWith('audio/'))         return 'Audio';
  if (mimeType.startsWith('video/'))         return 'Video';
  return mimeType.split('/').pop()?.toUpperCase() ?? 'File';
}

// ── StatusIcon ─────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: WaMsgStatus }) {
  switch (status) {
    case 'pending':   return <Clock       className="h-3 w-3 text-white/60" />;
    case 'sent':      return <Check       className="h-3 w-3 text-white/70" />;
    case 'delivered': return <CheckCheck  className="h-3 w-3 text-white/70" />;
    case 'read':      return <CheckCheck  className="h-3 w-3 text-blue-200" />;
    case 'failed':    return <AlertCircle className="h-3 w-3 text-red-300"  />;
    default:          return null;
  }
}

// ── DocumentCard ───────────────────────────────────────────────────────────────

function DocumentCard({
  url, filename, mimeType, outgoing,
}: {
  url:      string | null;
  filename: string | null;
  mimeType: string | null;
  outgoing: boolean;
}) {
  return (
    <a
      href={url ?? '#'}
      download={filename ?? 'document'}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'flex items-center gap-2.5 p-2.5 rounded-xl transition-colors',
        outgoing
          ? 'bg-white/15 hover:bg-white/25'
          : 'bg-muted hover:bg-muted/70',
      )}
    >
      <div className={clsx(
        'h-9 w-9 rounded-lg flex-shrink-0 flex items-center justify-center',
        outgoing
          ? 'bg-white/20'
          : mimeType?.includes('pdf')
            ? 'bg-red-100'
            : 'bg-blue-100',
      )}>
        <FileText className={clsx(
          'h-4 w-4',
          outgoing ? 'text-white/80' : mimeType?.includes('pdf') ? 'text-red-500' : 'text-blue-500',
        )} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate max-w-[18ch]">
          {filename ?? 'Document'}
        </p>
        <p className={clsx(
          'text-[10px]',
          outgoing ? 'text-white/60' : 'text-muted-foreground',
        )}>
          {mimeLabel(mimeType)}
        </p>
      </div>
    </a>
  );
}

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: WaMessage }) {
  const outgoing     = msg.direction === 'outgoing';
  const isOptimistic = msg.id.startsWith('optimistic-');
  const type         = msg.message_type;

  const bubbleBase = clsx(
    'relative max-w-[75%] sm:max-w-[65%] rounded-2xl shadow-sm transition-opacity',
    outgoing
      ? 'bg-[#25D366] text-white rounded-br-sm'
      : 'bg-card border border-border text-foreground rounded-bl-sm',
    isOptimistic && 'opacity-70',
  );

  // Shared footer: timestamp + status tick
  const footer = (
    <div className={clsx('flex items-center gap-1', outgoing ? 'justify-end' : 'justify-start')}>
      <span className={clsx('text-[10px]', outgoing ? 'text-white/60' : 'text-muted-foreground')}>
        {messageTime(msg.created_at)}
      </span>
      {outgoing && <StatusIcon status={msg.status} />}
    </div>
  );

  const errorLine = msg.status === 'failed' && msg.error_message
    ? <p className="mt-1 text-[10px] text-red-300 leading-tight">{msg.error_message}</p>
    : null;

  // ── Image ──────────────────────────────────────────────────────────────────
  if (type === 'image' && msg.media_url) {
    return (
      <div className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
        <div className={clsx(bubbleBase, 'overflow-hidden p-0')}>
          <img
            src={msg.media_url}
            alt={msg.media_filename ?? 'image'}
            className="block w-full max-w-xs object-cover"
            loading="lazy"
          />
          <div className="px-3.5 pt-1.5 pb-2.5">
            {msg.body && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mb-1">
                {msg.body}
              </p>
            )}
            {footer}
            {errorLine}
          </div>
        </div>
      </div>
    );
  }

  // ── Video ──────────────────────────────────────────────────────────────────
  if (type === 'video' && msg.media_url) {
    return (
      <div className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
        <div className={clsx(bubbleBase, 'overflow-hidden p-0')}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video controls src={msg.media_url} className="block w-full max-w-xs" />
          <div className="px-3.5 pt-1.5 pb-2.5">
            {msg.body && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mb-1">
                {msg.body}
              </p>
            )}
            {footer}
            {errorLine}
          </div>
        </div>
      </div>
    );
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  if (type === 'audio' && msg.media_url) {
    return (
      <div className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
        <div className={clsx(bubbleBase, 'px-3.5 py-2.5')}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={msg.media_url} className="w-full max-w-xs block" />
          {msg.body && (
            <p className="text-sm mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
              {msg.body}
            </p>
          )}
          <div className="mt-1">{footer}</div>
          {errorLine}
        </div>
      </div>
    );
  }

  // ── Document ───────────────────────────────────────────────────────────────
  if (type === 'document') {
    return (
      <div className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
        <div className={clsx(bubbleBase, 'px-3.5 py-2.5')}>
          <DocumentCard
            url={msg.media_url}
            filename={msg.media_filename}
            mimeType={msg.media_mime_type}
            outgoing={outgoing}
          />
          {msg.body && (
            <p className="text-sm mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
              {msg.body}
            </p>
          )}
          <div className="mt-1">{footer}</div>
          {errorLine}
        </div>
      </div>
    );
  }

  // ── Text (default) ─────────────────────────────────────────────────────────
  return (
    <div className={clsx('flex', outgoing ? 'justify-end' : 'justify-start')}>
      <div className={clsx(bubbleBase, 'px-3.5 py-2.5')}>
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

// ── DateSep ────────────────────────────────────────────────────────────────────

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

// ── AttachmentPreview ──────────────────────────────────────────────────────────
//
// Panel shown above the composer when a file is attached.
// uploadProgress: null = not uploading yet, 0–99 = uploading, 100 = sending via API.

interface AttachmentState {
  file:       File;
  previewUrl: string;  // blob: URL created via URL.createObjectURL
  msgType:    WaMsgType;
}

function AttachmentPreview({
  attachment,
  uploadProgress,
  onRemove,
}: {
  attachment:     AttachmentState;
  uploadProgress: number | null;
  onRemove:       () => void;
}) {
  const { file, previewUrl, msgType } = attachment;
  const isActive = uploadProgress !== null;

  return (
    <div className="flex-shrink-0 border-t border-border bg-muted/20 px-4 py-3">
      <div className="flex items-start gap-3">

        {/* Thumbnail */}
        <div className="h-16 w-16 rounded-xl overflow-hidden flex-shrink-0 bg-muted border border-border">
          {msgType === 'image' && (
            <img src={previewUrl} alt="preview" className="h-full w-full object-cover" />
          )}
          {msgType === 'video' && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
          )}
          {msgType === 'audio' && (
            <div className="h-full w-full flex items-center justify-center bg-violet-50 dark:bg-violet-950/30">
              <Music2 className="h-6 w-6 text-violet-400" />
            </div>
          )}
          {msgType === 'document' && (
            <div className="h-full w-full flex items-center justify-center bg-blue-50 dark:bg-blue-950/30">
              <FileText className="h-6 w-6 text-blue-400" />
            </div>
          )}
        </div>

        {/* File info + progress */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatBytes(file.size)} · {mimeLabel(file.type)}
          </p>

          {isActive && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">
                  {uploadProgress < 100 ? 'Uploading…' : 'Sending…'}
                </span>
                {uploadProgress < 100 && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {uploadProgress}%
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#25D366] rounded-full transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Remove (disabled while sending) */}
        {!isActive && (
          <button
            onClick={onRemove}
            aria-label="Remove attachment"
            className="flex-shrink-0 h-6 w-6 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  conversation:  WaConversation;
  token:         string;
  onBack:        () => void;
  onMessageSent: () => void;
}

// ── ChatWindow ─────────────────────────────────────────────────────────────────

export default function ChatWindow({ conversation, token, onBack, onMessageSent }: Props) {
  const { profile } = useAuth();
  const companyId   = profile?.company_id ?? null;

  // ── Message state ──────────────────────────────────────────────────────────
  const [messages,       setMessages]       = useState<WaMessage[]>([]);
  const [total,          setTotal]          = useState(0);
  const [earliestOffset, setEarliestOffset] = useState<number | null>(null);
  const [isLoading,      setIsLoading]      = useState(true);
  const [loadingOlder,   setLoadingOlder]   = useState(false);
  const [fetchError,     setFetchError]     = useState<string | null>(null);

  // ── Composer state ─────────────────────────────────────────────────────────
  const [draft,          setDraft]          = useState('');
  const [sending,        setSending]        = useState(false);
  const [sendError,      setSendError]      = useState<string | null>(null);
  const [unreadCount,    setUnreadCount]    = useState(0);

  // ── Attachment state ───────────────────────────────────────────────────────
  const [attachment,     setAttachment]     = useState<AttachmentState | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const scrollRef    = useRef<HTMLDivElement>(null);
  const sentinelRef  = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Scroll helpers ─────────────────────────────────────────────────────────

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

  // ── Load initial messages (most-recent PAGE_SIZE) ──────────────────────────

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

      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load messages.');
      setIsLoading(false);
    }
  }, [token, conversation.id]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // ── Load older messages (IntersectionObserver at top) ─────────────────────

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

  // ── Realtime: incoming messages + status updates ───────────────────────────

  const handleRealtimeInsert = useCallback((msg: WaMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    setTotal(t => t + 1);

    if (isNearBottom()) {
      scrollToBottom('smooth');
      markConversationSeen(conversation.id);
    } else if (msg.direction === 'incoming') {
      setUnreadCount(c => c + 1);
    }
  }, [conversation.id]);

  const handleRealtimeUpdate = useCallback((msg: WaMessage) => {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
  }, []);

  useMessagesRealtime(conversation.id, companyId, handleRealtimeInsert, handleRealtimeUpdate);

  // ── File selection ─────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setSendError(`File too large — maximum is ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }

    // Revoke any previous preview URL to avoid memory leaks
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);

    setAttachment({
      file,
      previewUrl: URL.createObjectURL(file),
      msgType:    detectMsgType(file),
    });
    setSendError(null);
  }, [attachment]);

  const handleRemoveAttachment = useCallback(() => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }, [attachment]);

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => { if (attachment) URL.revokeObjectURL(attachment.previewUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    const body = draft.trim();
    if (!attachment && !body) return;
    if (sending) return;

    setSending(true);
    setSendError(null);
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const optimisticId      = `optimistic-${Date.now()}`;
    const pendingAttachment = attachment; // snapshot before any state clears

    const optimistic: WaMessage = {
      id:                optimisticId,
      conversation_id:   conversation.id,
      direction:         'outgoing',
      message_type:      pendingAttachment?.msgType ?? 'text',
      body,
      media_url:         pendingAttachment?.previewUrl ?? null,
      media_mime_type:   pendingAttachment?.file.type  ?? null,
      media_filename:    pendingAttachment?.file.name  ?? null,
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
      let mediaUrl:      string | undefined;
      let mediaMimeType: string | undefined;
      let mediaFilename: string | undefined;
      const msgType: WaMsgType = pendingAttachment?.msgType ?? 'text';

      if (pendingAttachment) {
        // ── Step 1: get signed upload URL from backend ───────────────────
        setUploadProgress(0);
        const uploadData = await requestUploadUrl(token, {
          conversationId: conversation.id,
          filename:       pendingAttachment.file.name,
          mimeType:       pendingAttachment.file.type,
        });

        // ── Step 2: PUT file directly to Supabase Storage ────────────────
        await uploadFileToStorage(
          uploadData.signedUrl,
          pendingAttachment.file,
          setUploadProgress,
        );
        setUploadProgress(100); // hold at 100% while API call is in-flight

        mediaUrl      = uploadData.publicUrl;
        mediaMimeType = pendingAttachment.file.type;
        mediaFilename = pendingAttachment.file.name;

        // Swap the blob: URL in the optimistic message for the real Storage URL
        // so the image/video/audio renders from Supabase immediately
        setMessages(prev => prev.map(m =>
          m.id === optimisticId ? { ...m, media_url: mediaUrl! } : m,
        ));
      }

      // ── Step 3: record + dispatch via backend API ────────────────────────
      const { message: real } = await sendMessage(token, {
        conversationId: conversation.id,
        body,
        messageType:    msgType,
        mediaUrl,
        mediaMimeType,
        mediaFilename,
      });

      // Race-safe replacement of the optimistic entry
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
      // Delay revocation so the optimistic image has time to swap to the real URL
      if (pendingAttachment) {
        const url = pendingAttachment.previewUrl;
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }
      setAttachment(null);
      setUploadProgress(null);
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
  const canSend  = !sending && (!!draft.trim() || !!attachment);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full relative">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="sr-only"
        onChange={handleFileSelect}
      />

      {/* ── Contact header ─────────────────────────────────────────────────── */}
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

      {/* ── Messages area ───────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.02\'%3E%3Cpath d=\'m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30v4h-4v2h4v4h2v-4h4v-2h-4v-4h-2zm-24 18v4h-4v2h4v4h2v-4h4v-2h-4v-4h-2z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]"
      >
        {/* Top sentinel for IntersectionObserver */}
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

      {/* ── "New messages" scroll-down badge ───────────────────────────────── */}
      {unreadCount > 0 && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => { scrollToBottom(); setUnreadCount(0); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-semibold shadow-lg hover:bg-[#1ebe5d] transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {unreadCount} new message{unreadCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* ── Attachment preview panel ────────────────────────────────────────── */}
      {attachment && (
        <AttachmentPreview
          attachment={attachment}
          uploadProgress={uploadProgress}
          onRemove={handleRemoveAttachment}
        />
      )}

      {/* ── Send error banner ───────────────────────────────────────────────── */}
      {sendError && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <p className="text-xs text-destructive">{sendError}</p>
          <button onClick={() => setSendError(null)} className="text-xs text-destructive underline flex-shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Message composer ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border bg-card px-4 py-3">
        <div className="flex items-end gap-2">

          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach file"
            className="flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Draft textarea */}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder={attachment ? 'Add a caption… (optional)' : 'Type a message…'}
            rows={1}
            maxLength={4096}
            disabled={sending}
            className="flex-1 resize-none rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-60 leading-relaxed overflow-hidden"
            style={{ minHeight: '2.75rem', maxHeight: '140px' }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className={clsx(
              'flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center transition-all',
              canSend
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
