/**
 * WhatsApp API types and fetch utilities.
 * All calls go through the Vite proxy:  /api → http://localhost:8080
 */

// ── Domain types ──────────────────────────────────────────────────────────────

export type WaConvStatus   = 'active' | 'archived' | 'blocked';
export type WaMsgDirection = 'incoming' | 'outgoing';
export type WaMsgType      = 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'location' | 'sticker';
export type WaMsgStatus    = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';

export interface WaConversation {
  id:              string;
  lead_id:         string | null;
  contact_name:    string | null;
  contact_phone:   string;
  status:          WaConvStatus;
  last_message_at: string | null;
  created_by:      string;
  created_at:      string;
  updated_at:      string;
}

export interface WaMessage {
  id:                string;
  conversation_id:   string;
  direction:         WaMsgDirection;
  message_type:      WaMsgType;
  body:              string;
  media_url:         string | null;
  media_mime_type:   string | null;
  media_filename:    string | null;
  template_name:     string | null;
  template_params:   Record<string, unknown> | null;
  status:            WaMsgStatus;
  status_updated_at: string | null;
  error_code:        string | null;
  error_message:     string | null;
  external_id:       string | null;
  sent_by:           string | null;
  created_at:        string;
  updated_at:        string;
}

export interface ConversationsPage {
  conversations: WaConversation[];
  total:         number;
  limit:         number;
  offset:        number;
}

export interface MessagesPage {
  messages: WaMessage[];
  total:    number;
  limit:    number;
  offset:   number;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const BASE = '/api/whatsapp';

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export async function fetchConversations(
  token:  string,
  offset  = 0,
  limit   = 30,
  status?: WaConvStatus,
): Promise<ConversationsPage> {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) p.set('status', status);
  const res = await fetch(`${BASE}/conversations?${p}`, { headers: authHeaders(token) });
  return parseOrThrow<ConversationsPage>(res);
}

export async function fetchMessages(
  token:          string,
  conversationId: string,
  offset          = 0,
  limit           = 50,
): Promise<MessagesPage> {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${BASE}/messages/${conversationId}?${p}`, { headers: authHeaders(token) });
  return parseOrThrow<MessagesPage>(res);
}

export interface SendPayload {
  conversationId: string;
  /** Plain-text body / caption. Required for text; optional for media. */
  body?:          string;
  messageType?:   WaMsgType;
  /** Populated for image / document / audio / video messages */
  mediaUrl?:      string;
  mediaMimeType?: string;
  mediaFilename?: string;
}

export async function sendMessage(
  token:   string,
  payload: SendPayload,
): Promise<{ success: boolean; message: WaMessage }> {
  const res = await fetch(`${BASE}/send`, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

// ── Media upload ─────────────────────────────────────────────────────────────

export interface UploadUrlRequest {
  conversationId: string;
  filename:       string;
  mimeType:       string;
}

export interface UploadUrlResponse {
  signedUrl: string;
  path:      string;
  publicUrl: string;
}

/**
 * Asks the API server for a Supabase Storage signed upload URL.
 * The browser then PUTs the file directly to Supabase (see uploadFileToStorage).
 */
export async function requestUploadUrl(
  token:   string,
  payload: UploadUrlRequest,
): Promise<UploadUrlResponse> {
  const res = await fetch(`${BASE}/upload-url`, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify(payload),
  });
  return parseOrThrow<UploadUrlResponse>(res);
}

/**
 * Uploads a file to Supabase Storage via the signed URL returned by
 * requestUploadUrl. Uses XMLHttpRequest so upload progress can be tracked.
 */
export function uploadFileToStorage(
  signedUrl:  string,
  file:       File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed: HTTP ${xhr.status}`));
    });

    xhr.addEventListener('error', () => reject(new Error('Upload network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

export type WaTemplateStatus   = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paused';
export type WaTemplateCategory = 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
export type WaTemplateHeaderType = 'none' | 'text' | 'image' | 'document' | 'video';

export interface WaTemplate {
  id:               string;
  name:             string;
  category:         WaTemplateCategory;
  language:         string;
  status:           WaTemplateStatus;
  header_type:      WaTemplateHeaderType | null;
  header_content:   string | null;
  body_text:        string;
  footer_text:      string;
  buttons:          unknown[];
  external_id:      string | null;
  rejection_reason: string | null;
  created_at:       string;
  updated_at:       string;
}

export async function fetchTemplates(
  token:  string,
  status  = 'approved',
): Promise<{ templates: WaTemplate[] }> {
  const p = new URLSearchParams({ status });
  const res = await fetch(`${BASE}/templates?${p}`, { headers: authHeaders(token) });
  return parseOrThrow<{ templates: WaTemplate[] }>(res);
}

export async function syncTemplates(
  token: string,
): Promise<{ success: boolean; synced: number; added: number; updated: number }> {
  const res = await fetch(`${BASE}/templates/sync`, {
    method:  'POST',
    headers: authHeaders(token),
  });
  return parseOrThrow(res);
}

export interface SendTemplatePayload {
  conversationId: string;
  templateId:     string;
  /** Ordered substitution values for {{1}}, {{2}}, … body variables. */
  templateParams: string[];
}

export async function sendTemplateMessage(
  token:   string,
  payload: SendTemplatePayload,
): Promise<{ success: boolean; message: WaMessage }> {
  const res = await fetch(`${BASE}/send-template`, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

/**
 * Returns sorted unique variable indices from a template body string.
 * e.g. "Hello {{1}}, your order {{2}} is ready." → [1, 2]
 */
export function extractTemplateVars(bodyText: string): number[] {
  const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
  const indices = new Set(matches.map(m => parseInt(m[1], 10)));
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Substitutes {{n}} placeholders with the corresponding value.
 * Placeholders not yet filled keep their original form for preview purposes.
 */
export function renderTemplateBody(bodyText: string, params: string[]): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, n) => {
    const val = params[parseInt(n, 10) - 1];
    return val !== undefined && val.trim() !== '' ? val : match;
  });
}

// ── Unread tracking (localStorage) ───────────────────────────────────────────

const LS_PREFIX = 'wa_last_seen_';

export function markConversationSeen(convId: string): void {
  try { localStorage.setItem(LS_PREFIX + convId, new Date().toISOString()); } catch {}
}

export function isConversationUnread(conv: WaConversation): boolean {
  if (!conv.last_message_at) return false;
  try {
    const seen = localStorage.getItem(LS_PREFIX + conv.id);
    if (!seen) return true;
    return new Date(conv.last_message_at) > new Date(seen);
  } catch {
    return false;
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Avatar initials from a contact name or phone fallback */
export function contactInitials(conv: WaConversation): string {
  const name = conv.contact_name?.trim();
  if (!name) return conv.contact_phone.slice(-2);
  const parts = name.split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

/** Relative timestamp for conversation list */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d   = new Date(iso);
  const now = new Date();
  const diffMs   = now.getTime() - d.getTime();
  const diffMins = diffMs / 60_000;
  const diffHrs  = diffMs / 3_600_000;
  const diffDays = diffMs / 86_400_000;

  if (diffMins < 1)   return 'just now';
  if (diffMins < 60)  return `${Math.floor(diffMins)}m`;
  if (diffHrs  < 24)  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (diffDays < 7)   return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** Full time for message bubbles */
export function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Date separator label */
export function dateSeparator(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const diffDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (diffDays < 1) return 'Today';
  if (diffDays < 2) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
