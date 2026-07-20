/**
 * WhatsApp Chat Page
 *
 * Two-pane layout:
 *   Left  — conversation list with search and infinite scroll
 *   Right — chat window with message history, infinite scroll for older
 *            messages, and the message composer
 *
 * Mobile: single-pane with back navigation (conversation list → chat).
 */
import { useState, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  type WaConversation,
  fetchConversations,
  markConversationSeen,
} from '@/lib/whatsapp-api';
import ConversationList from '@/components/whatsapp/ConversationList';
import ChatWindow from '@/components/whatsapp/ChatWindow';
import { useConversationsRealtime } from '@/hooks/useWhatsAppRealtime';

const CONV_LIMIT = 30;

export default function WhatsAppPage() {
  const { session, profile } = useAuth();
  const token                = session?.access_token ?? '';
  const companyId            = profile?.company_id ?? null;
  const qc          = useQueryClient();

  const [selectedConv, setSelectedConv] = useState<WaConversation | null>(null);
  // On mobile, `showChat` controls whether the chat pane is visible
  const [showChat,     setShowChat]     = useState(false);
  const [search,       setSearch]       = useState('');

  // ── Conversations query ────────────────────────────────────────────────────
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['wa-conversations', token],
    queryFn:  ({ pageParam }) =>
      fetchConversations(token, pageParam as number, CONV_LIMIT),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
    enabled:   !!token,
    staleTime: 30_000,
    // No polling — Supabase Realtime keeps the list live via useConversationsRealtime
  });

  const allConversations: WaConversation[] = data?.pages.flatMap(p => p.conversations) ?? [];

  // ── Sync selectedConv when conversations list updates ─────────────────────
  // (e.g. last_message_at changed after a send)
  useEffect(() => {
    if (!selectedConv) return;
    const fresh = allConversations.find(c => c.id === selectedConv.id);
    if (fresh) setSelectedConv(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Conversation selection ─────────────────────────────────────────────────
  const handleSelect = useCallback((conv: WaConversation) => {
    setSelectedConv(conv);
    setShowChat(true);
    markConversationSeen(conv.id);
  }, []);

  const handleBack = useCallback(() => {
    setShowChat(false);
  }, []);

  // Refresh conversation list after a message is sent (last_message_at updates)
  const handleMessageSent = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['wa-conversations', token] });
    if (selectedConv) markConversationSeen(selectedConv.id);
  }, [qc, token, selectedConv]);

  // ── Height: fill the DashboardLayout content area ─────────────────────────
  // DashboardLayout wraps <Outlet/> in:
  //   <main class="...overflow-hidden pt-14 md:pt-0">
  //     <header class="h-16">
  //     <div class="flex-1 overflow-y-auto p-6">      ← our parent
  //       <div class="max-w-7xl mx-auto">             ← our grandparent
  //         <Outlet />                               ← us
  //
  // To fill height without outer scroll:
  //   • -m-6 counteracts the p-6 padding on our parent
  //   • h-[calc(100vh-4rem)]   desktop: viewport minus 4rem header
  //   • h-[calc(100vh-7.5rem)] mobile:  minus header (4rem) + topbar (3.5rem)

  return (
    <div className="-m-6 overflow-hidden flex h-[calc(100vh-7.5rem)] md:h-[calc(100vh-4rem)]">

      {/* ── Left: Conversation list ─────────────────────────────────────── */}
      <div className={`
        w-full md:w-80 lg:w-96 flex-shrink-0
        border-r border-border bg-card
        flex flex-col
        ${showChat ? 'hidden md:flex' : 'flex'}
      `}>
        <ConversationList
          conversations={allConversations}
          hasMore={!!hasNextPage}
          isFetchingMore={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          selectedId={selectedConv?.id ?? null}
          onSelect={handleSelect}
          search={search}
          onSearchChange={setSearch}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
        />
      </div>

      {/* ── Right: Chat window or empty state ──────────────────────────── */}
      <div className={`
        flex-1 flex flex-col min-w-0
        ${showChat ? 'flex' : 'hidden md:flex'}
      `}>
        {selectedConv && token ? (
          <ChatWindow
            key={selectedConv.id}   /* remount on conversation change */
            conversation={selectedConv}
            token={token}
            onBack={handleBack}
            onMessageSent={handleMessageSent}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// ── Empty state shown on desktop when no conversation is selected ─────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-muted/20 text-center px-8">
      <div className="h-16 w-16 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
        <MessageSquare className="h-8 w-8 text-[#25D366]" />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">WhatsApp Chat</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Select a conversation from the list to view messages and reply.
        </p>
      </div>
      <p className="text-xs text-muted-foreground/60 max-w-xs">
        Incoming messages appear automatically. Outgoing messages are delivered via the Meta WhatsApp Cloud API.
      </p>
    </div>
  );
}
