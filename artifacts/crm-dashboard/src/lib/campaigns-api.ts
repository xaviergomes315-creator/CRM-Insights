/**
 * WhatsApp Campaigns API — types and fetch utilities.
 * All calls go through the Vite proxy: /api → http://localhost:8080
 */

// ── Domain types ───────────────────────────────────────────────────────────────

export type CampaignStatus      = 'draft' | 'running' | 'completed' | 'cancelled';
export type CampaignMessageType = 'text' | 'template';

export interface Campaign {
  id:               string;
  company_id:       string;
  created_by:       string;
  name:             string;
  message_type:     CampaignMessageType;
  body:             string;
  template_id:      string | null;
  template_params:  string[];
  conversation_ids: string[];
  scheduled_at:     string | null;
  status:           CampaignStatus;
  total_count:      number;
  sent_count:       number;
  failed_count:     number;
  cancelled_count:  number;
  started_at:       string | null;
  completed_at:     string | null;
  created_at:       string;
  updated_at:       string;
}

export interface CampaignsPage {
  items:  Campaign[];
  total:  number;
  limit:  number;
  offset: number;
}

// ── Fetch helpers ──────────────────────────────────────────────────────────────

const BASE = '/api/whatsapp/campaigns';

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function fetchCampaigns(
  token:  string,
  params?: { status?: CampaignStatus; limit?: number; offset?: number },
): Promise<CampaignsPage> {
  const p = new URLSearchParams();
  if (params?.status) p.set('status', params.status);
  p.set('limit',  String(params?.limit  ?? 50));
  p.set('offset', String(params?.offset ?? 0));
  const res = await fetch(`${BASE}?${p}`, { headers: authHeaders(token) });
  return parseOrThrow<CampaignsPage>(res);
}

export interface CreateCampaignPayload {
  name:             string;
  messageType:      CampaignMessageType;
  body?:            string;
  templateId?:      string;
  templateParams?:  string[];
  conversationIds:  string[];
  scheduledAt?:     string;
}

export async function createCampaign(
  token:   string,
  payload: CreateCampaignPayload,
): Promise<{ success: boolean; campaign: Campaign }> {
  const res = await fetch(BASE, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

export async function startCampaign(
  token: string,
  id:    string,
): Promise<{ success: boolean; campaign: Campaign; queued: number }> {
  const res = await fetch(`${BASE}/${id}/start`, {
    method:  'POST',
    headers: authHeaders(token),
  });
  return parseOrThrow(res);
}

export async function cancelCampaign(
  token: string,
  id:    string,
): Promise<{ success: boolean; campaign: Campaign }> {
  const res = await fetch(`${BASE}/${id}`, {
    method:  'DELETE',
    headers: authHeaders(token),
  });
  return parseOrThrow(res);
}
