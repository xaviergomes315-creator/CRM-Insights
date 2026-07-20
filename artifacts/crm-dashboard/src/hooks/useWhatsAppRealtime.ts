/**
 * Supabase Realtime hooks for the WhatsApp Chat UI.
 *
 * useConversationsRealtime  — patches the React Query infinite cache directly
 *   on whatsapp_conversations INSERT / UPDATE so the conversation list stays
 *   live without polling. Updated conversations bubble to the top of the list.
 *
 * useMessagesRealtime — fires callbacks on whatsapp_messages INSERT / UPDATE
 *   for the currently-open conversation. Callbacks are accessed via refs so
 *   the Supabase channel is only created once per conversation, never on
 *   every handler change.
 *
 * Both hooks call supabase.removeChannel() in their cleanup functions.
 *
 * ─── Supabase dashboard prerequisite ────────────────────────────────────────
 * Postgres CDC (Change Data Capture) must be enabled for both tables:
 *   Database → Replication → Source → enable whatsapp_conversations
 *                                    enable whatsapp_messages
 * Without this the channels subscribe successfully but never receive events.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { WaConversation, WaMessage, ConversationsPage } from '@/lib/whatsapp-api';

// ── Type alias for the React Query infinite cache shape ───────────────────────

type ConvCache = InfiniteData<ConversationsPage, number>;

// ─────────────────────────────────────────────────────────────────────────────
// useConversationsRealtime
//
// Keeps the conversation list live. Subscribes once per companyId + token pair.
// INSERT  → prepend to page 0 (dedup by id)
// UPDATE  → update in every page, then promote to top of page 0 (active-first)
// ─────────────────────────────────────────────────────────────────────────────

export function useConversationsRealtime(
  companyId: string | null,
  token:     string,
): void {
  const qc       = useQueryClient();
  const queryKey = ['wa-conversations', token] as const;

  useEffect(() => {
    if (!companyId || !token) return;

    const channel = supabase
      .channel(`wa-convs:${companyId}`)

      // ── New conversation created ────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'whatsapp_conversations',
          filter: `company_id=eq.${companyId}`,
        },
        ({ new: row }) => {
          const newConv = row as WaConversation;

          qc.setQueryData<ConvCache>(queryKey, old => {
            if (!old) return old;

            // Deduplicate — realtime can fire after an optimistic API insert
            const alreadyPresent = old.pages.some(p =>
              p.conversations.some(c => c.id === newConv.id),
            );
            if (alreadyPresent) return old;

            return {
              ...old,
              pages: old.pages.map((page, i) =>
                i === 0
                  ? {
                      ...page,
                      conversations: [newConv, ...page.conversations],
                      total:         page.total + 1,
                    }
                  : page,
              ),
            };
          });
        },
      )

      // ── Conversation updated (last_message_at, status, …) ──────────────
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'whatsapp_conversations',
          filter: `company_id=eq.${companyId}`,
        },
        ({ new: row }) => {
          const updated = row as WaConversation;

          qc.setQueryData<ConvCache>(queryKey, old => {
            if (!old) return old;

            // Find the existing row across all pages
            let existing: WaConversation | undefined;
            for (const page of old.pages) {
              existing = page.conversations.find(c => c.id === updated.id);
              if (existing) break;
            }
            if (!existing) return old;

            const merged = { ...existing, ...updated };

            // Remove from wherever it is, then prepend to page 0 so the
            // most recently active conversation rises to the top.
            return {
              ...old,
              pages: old.pages.map((page, i) => {
                const without = page.conversations.filter(c => c.id !== updated.id);
                return i === 0
                  ? { ...page, conversations: [merged, ...without] }
                  : { ...page, conversations: without };
              }),
            };
          });
        },
      )

      .subscribe((status, err) => {
        if (err) console.error('[WA Realtime] conversations channel error:', err);
        else     console.debug('[WA Realtime] conversations channel:', status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [companyId, token, qc]); // queryKey is derived from token; qc is stable
}

// ─────────────────────────────────────────────────────────────────────────────
// useMessagesRealtime
//
// Fires onInsert / onUpdate callbacks for events in the given conversation.
// Subscriptions are bound to conversationId — they clean up and re-create
// whenever the open conversation changes (via the key prop on ChatWindow).
//
// Callbacks are stored in refs so the channel is never torn down due to a
// handler identity change; the latest closures are always used.
// ─────────────────────────────────────────────────────────────────────────────

export function useMessagesRealtime(
  conversationId: string,
  companyId:      string | null,
  onInsert:       (msg: WaMessage) => void,
  onUpdate:       (msg: WaMessage) => void,
): void {
  // Stable refs — never cause the subscription to restart
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!conversationId || !companyId) return;

    const channel = supabase
      .channel(`wa-msgs:${conversationId}`)

      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        ({ new: row }) => onInsertRef.current(row as WaMessage),
      )

      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        ({ new: row }) => onUpdateRef.current(row as WaMessage),
      )

      .subscribe((status, err) => {
        if (err) console.error('[WA Realtime] messages channel error:', err);
        else     console.debug('[WA Realtime] messages channel:', status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, companyId]);
}
