import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, type LeadRow } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type LeadSource = 'WhatsApp' | 'Website' | 'IndiaMart' | 'JustDial' | 'Social Media';
export type LeadStatus = 'New' | 'Interested' | 'Demo Scheduled' | 'Closed';

export interface Lead {
  id:             number;
  name:           string;
  email:          string;
  phone:          string;
  status:         LeadStatus;
  source:         LeadSource;
  assignedTo:     string;   // telecaller user id
  addedAt:        number;   // Unix ms
  lastActivityAt: number;   // Unix ms
}

// addLead callers never provide assignedTo — the context assigns via round-robin
type AddLeadData = Omit<Lead, 'id' | 'status' | 'addedAt' | 'lastActivityAt' | 'assignedTo'>;

interface LeadsContextType {
  leads:           Lead[];
  newArrivals:     Lead[];
  loading:         boolean;
  addLead:         (data: AddLeadData) => Promise<void>;
  updateLead:      (id: number, data: Partial<Omit<Lead, 'id' | 'addedAt'>>) => Promise<void>;
  deleteLead:      (id: number) => Promise<void>;
  dismissArrivals: () => void;
}

// ─── Telecaller pool ──────────────────────────────────────────────────────────
// Populated at runtime from the user_profiles table (role = 'employee').
// Pages that need the pool (Dashboard leaderboard, round-robin) read this ref.
export let TELECALLER_POOL: { id: string; name: string }[] = [];

// ─── Idle lead helpers ────────────────────────────────────────────────────────

const IDLE_MS = 48 * 60 * 60 * 1000; // 48 hours

export function isIdleLead(lead: Lead): boolean {
  if (lead.status !== 'New' && lead.status !== 'Interested') return false;
  return Date.now() - lead.lastActivityAt > IDLE_MS;
}

export function getDripWhatsAppUrl(lead: Lead): string {
  const msg = [
    `Hi ${lead.name}! 👋`,
    ``,
    `We noticed your inquiry with us a while back and wanted to follow up! 😊`,
    ``,
    `We have exciting updates to share — we'd love to reconnect when you have a moment. 🎯`,
    ``,
    `Just reply here or give us a call. Looking forward to hearing from you!`,
    ``,
    `— CRM Pro Team`,
  ].join('\n');
  const phone = lead.phone.replace(/\D/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

// ─── Row ↔ Lead mappers ───────────────────────────────────────────────────────

function rowToLead(row: LeadRow): Lead {
  return {
    id:             row.id,
    name:           row.name,
    email:          row.email,
    phone:          row.phone,
    status:         row.status  as LeadStatus,
    source:         row.source  as LeadSource,
    assignedTo:     row.assigned_to,
    addedAt:        row.added_at,
    lastActivityAt: row.last_activity_at,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const LeadsContext = createContext<LeadsContextType | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, profile } = useAuth();

  const [leads, setLeads]             = useState<Lead[]>([]);
  const [newArrivals, setNewArrivals] = useState<Lead[]>([]);
  const [loading, setLoading]         = useState(false);

  // Round-robin ref — corrected after first DB load
  const rrIndexRef = useRef(0);

  // ── Fetch telecaller pool from DB ──────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !profile?.company_id) return;
    supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('company_id', profile.company_id)
      .eq('role', 'employee')
      .then(({ data }) => {
        if (data) {
          TELECALLER_POOL = data.map(u => ({ id: u.id, name: u.full_name }));
        }
      });
  }, [isAuthenticated, profile?.company_id]);

  // ── Initial load (only when authenticated) ──────────────────────────────────

  useEffect(() => {
    // Clear state on logout
    if (!isAuthenticated) {
      setLeads([]);
      setNewArrivals([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('added_at', { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error('[LeadsContext] initial load error', error);
        toast.error('Could not load leads', { description: error.message });
        setLoading(false);
        return;
      }

      const loaded = (data as LeadRow[]).map(rowToLead);
      setLeads(loaded);

      // Seed the round-robin index from the real row count so new assignments
      // continue where the database left off.
      rrIndexRef.current = loaded.length % Math.max(TELECALLER_POOL.length, 1);

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const addLead = useCallback(async (data: AddLeadData) => {
    const ts = Date.now();

    // Round-robin assignment
    const poolSize   = Math.max(TELECALLER_POOL.length, 1);
    const assignedTo = TELECALLER_POOL[rrIndexRef.current % poolSize]?.id ?? '';
    rrIndexRef.current = (rrIndexRef.current + 1) % poolSize;

    const row: Omit<LeadRow, 'id'> = {
      company_id:       profile?.company_id ?? null,
      name:             data.name,
      email:            data.email,
      phone:            data.phone,
      status:           'New',
      source:           data.source,
      assigned_to:      assignedTo,
      added_at:         ts,
      last_activity_at: ts,
    };

    const { data: inserted, error } = await supabase
      .from('leads')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('[LeadsContext] addLead error', error);
      toast.error('Failed to add lead', { description: error.message });
      return;
    }

    const newLead = rowToLead(inserted as LeadRow);
    setLeads(prev => [newLead, ...prev]);
    setNewArrivals(prev => [newLead, ...prev]);
  }, [profile?.company_id]);

  const updateLead = useCallback(
    async (id: number, data: Partial<Omit<Lead, 'id' | 'addedAt'>>) => {
      const now = Date.now();

      const patch: Partial<LeadRow> & { last_activity_at: number } = {
        last_activity_at: now,
      };
      if (data.name        !== undefined) patch.name             = data.name;
      if (data.email       !== undefined) patch.email            = data.email;
      if (data.phone       !== undefined) patch.phone            = data.phone;
      if (data.status      !== undefined) patch.status           = data.status;
      if (data.source      !== undefined) patch.source           = data.source;
      if (data.assignedTo  !== undefined) patch.assigned_to      = data.assignedTo;
      if (data.lastActivityAt !== undefined) patch.last_activity_at = data.lastActivityAt;

      const { error } = await supabase
        .from('leads')
        .update(patch)
        .eq('id', id);

      if (error) {
        console.error('[LeadsContext] updateLead error', error);
        toast.error('Failed to update lead', { description: error.message });
        return;
      }

      setLeads(prev =>
        prev.map(l =>
          l.id === id
            ? { ...l, ...data, lastActivityAt: now }
            : l,
        ),
      );
    },
    [],
  );

  const deleteLead = useCallback(async (id: number) => {
    const { error } = await supabase.from('leads').delete().eq('id', id);

    if (error) {
      console.error('[LeadsContext] deleteLead error', error);
      toast.error('Failed to delete lead', { description: error.message });
      return;
    }

    setLeads(prev => prev.filter(l => l.id !== id));
  }, []);

  const dismissArrivals = useCallback(() => setNewArrivals([]), []);

  // ── Webhook SSE listener ────────────────────────────────────────────────────

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/webhooks/leads/stream');

      es.addEventListener('new_lead', (evt: MessageEvent) => {
        try {
          const d = JSON.parse(evt.data) as Record<string, unknown>;
          if (d.id && d.name) {
            const newLead = rowToLead(d as unknown as LeadRow);
            setLeads(prev => {
              if (prev.some(l => l.id === newLead.id)) return prev;
              return [newLead, ...prev];
            });
            setNewArrivals(prev => {
              if (prev.some(l => l.id === newLead.id)) return prev;
              return [newLead, ...prev];
            });
            rrIndexRef.current =
              (rrIndexRef.current + 1) % Math.max(TELECALLER_POOL.length, 1);
          }
        } catch {
          // ignore malformed SSE payload
        }
      });

      es.onerror = () => { /* EventSource auto-retries */ };
    } catch {
      // EventSource not available
    }

    return () => { es?.close(); };
  }, []); // no deps — refs & setters are stable

  return (
    <LeadsContext.Provider
      value={{ leads, newArrivals, loading, addLead, updateLead, deleteLead, dismissArrivals }}
    >
      {children}
    </LeadsContext.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error('useLeads must be used inside <LeadsProvider>');
  return ctx;
}
