import { useEffect, useRef } from 'react';
import { Search, MessageSquarePlus, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import {
  type WaConversation,
  contactInitials,
  relativeTime,
  isConversationUnread,
} from '@/lib/whatsapp-api';

interface Props {
  conversations:    WaConversation[];
  hasMore:          boolean;
  isFetchingMore:   boolean;
  onLoadMore:       () => void;
  selectedId:       string | null;
  onSelect:         (conv: WaConversation) => void;
  search:           string;
  onSearchChange:   (s: string) => void;
  isLoading:        boolean;
  isError:          boolean;
  onRetry:          () => void;
}

// Deterministic avatar colour from the contact's id string
const AVATAR_COLOURS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500',  'bg-teal-500',
  'bg-indigo-500', 'bg-rose-500',  'bg-amber-500',
];
function avatarColour(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}

export default function ConversationList({
  conversations,
  hasMore,
  isFetchingMore,
  onLoadMore,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  isLoading,
  isError,
  onRetry,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll — watch the bottom sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !isFetchingMore) onLoadMore(); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, isFetchingMore, onLoadMore]);

  // Client-side search filter (applied on already-fetched data)
  const filtered = conversations.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.contact_name?.toLowerCase().includes(q) ?? false) ||
      c.contact_phone.includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
          {conversations.length > 0 && (
            <span className="text-xs text-muted-foreground">{conversations.length} loaded</span>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name or number…"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/40 pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          />
        </div>
      </div>

      {/* ── List ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Loading skeleton */}
        {isLoading && (
          <div className="flex flex-col gap-1 p-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl animate-pulse">
                <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-2.5 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && isError && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load conversations.</p>
            <button
              onClick={onRetry}
              className="text-xs text-primary underline underline-offset-2 hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state — no conversations at all */}
        {!isLoading && !isError && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <MessageSquarePlus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Conversations will appear here when contacts message you via WhatsApp.
            </p>
          </div>
        )}

        {/* Empty state — search has no results */}
        {!isLoading && !isError && conversations.length > 0 && filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No conversations match &ldquo;{search}&rdquo;.
          </div>
        )}

        {/* Conversation rows */}
        {filtered.map(conv => {
          const active   = conv.id === selectedId;
          const unread   = isConversationUnread(conv);
          const initials = contactInitials(conv);
          const colour   = avatarColour(conv.id);

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors relative',
                active
                  ? 'bg-primary/8 border-l-2 border-l-primary'
                  : 'hover:bg-muted/50 border-l-2 border-l-transparent',
              )}
            >
              {/* Avatar */}
              <div className={clsx('relative h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold', colour)}>
                {initials}
                {/* Online dot placeholder — kept for future presence feature */}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-1">
                  <span className={clsx('text-sm truncate', unread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                    {conv.contact_name ?? conv.contact_phone}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {relativeTime(conv.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {conv.contact_phone}
                  </span>
                  {/* Unread badge */}
                  {unread && (
                    <span className="h-2 w-2 rounded-full bg-[#25D366] flex-shrink-0" aria-label="unread" />
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

        {/* Fetching more indicator */}
        {isFetchingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
