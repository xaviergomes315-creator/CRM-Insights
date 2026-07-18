import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { MOCK_USERS } from '@/contexts/AuthContext';

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
  assignedTo:     string;   // telecaller user id (from MOCK_USERS)
  addedAt:        number;   // Unix ms — used by Live Feed sort
  lastActivityAt: number;   // Unix ms — updated on every mutation; used for idle detection
}

// addLead callers never provide assignedTo — the context assigns via round-robin
type AddLeadData = Omit<Lead, 'id' | 'status' | 'addedAt' | 'lastActivityAt' | 'assignedTo'>;

interface LeadsContextType {
  leads:           Lead[];
  newArrivals:     Lead[];
  addLead:         (data: AddLeadData) => void;
  updateLead:      (id: number, data: Partial<Omit<Lead, 'id' | 'addedAt'>>) => void;
  deleteLead:      (id: number) => void;
  dismissArrivals: () => void;
}

// ─── Round-robin telecaller pool ─────────────────────────────────────────────
//
// Exported so Dashboard can build the leaderboard without duplicating the list.
// Pulling directly from MOCK_USERS (data import, no context cycle).

export const TELECALLER_POOL: { id: string; name: string }[] = MOCK_USERS
  .filter(u => u.role === 'Telecaller')
  .map(u => ({ id: u.id, name: u.name }));

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

// ─── Seed data ────────────────────────────────────────────────────────────────
//
// Pre-assign round-robin so the demo is immediately meaningful:
//   Odd seed index  → telecaller pool[0] (Ravi Kumar, id '2')
//   Even seed index → telecaller pool[1] (Sunita Rao,  id '3')

function rrId(seedIdx: number): string {
  return TELECALLER_POOL[seedIdx % TELECALLER_POOL.length].id;
}

const now  = Date.now();
const IDLE = now - 50 * 60 * 60 * 1000; // 50 h ago → triggers "Urgent Follow-up"

const INITIAL_LEADS: Lead[] = [
  { id: 1,  name: 'Priya Sharma',  email: 'priya@example.com',  phone: '+91 98001 11111', status: 'New',            source: 'IndiaMart',    assignedTo: rrId(0), addedAt: now - 9 * 60000, lastActivityAt: IDLE              },
  { id: 2,  name: 'Rahul Mehta',   email: 'rahul@example.com',  phone: '+91 98001 22222', status: 'Interested',     source: 'WhatsApp',     assignedTo: rrId(1), addedAt: now - 8 * 60000, lastActivityAt: now - 8 * 60000  },
  { id: 3,  name: 'Anita Desai',   email: 'anita@example.com',  phone: '+91 98001 33333', status: 'Closed',         source: 'Website',      assignedTo: rrId(2), addedAt: now - 7 * 60000, lastActivityAt: now - 7 * 60000  },
  { id: 4,  name: 'Vikram Nair',   email: 'vikram@example.com', phone: '+91 98001 44444', status: 'New',            source: 'JustDial',     assignedTo: rrId(3), addedAt: now - 6 * 60000, lastActivityAt: IDLE              },
  { id: 5,  name: 'Sunita Patel',  email: 'sunita@example.com', phone: '+91 98001 55555', status: 'Interested',     source: 'Social Media', assignedTo: rrId(4), addedAt: now - 5 * 60000, lastActivityAt: IDLE              },
  { id: 6,  name: 'Deepak Kumar',  email: 'deepak@example.com', phone: '+91 98001 66666', status: 'New',            source: 'IndiaMart',    assignedTo: rrId(5), addedAt: now - 4 * 60000, lastActivityAt: now - 4 * 60000  },
  { id: 7,  name: 'Meena Joshi',   email: 'meena@example.com',  phone: '+91 98001 77777', status: 'Closed',         source: 'Website',      assignedTo: rrId(6), addedAt: now - 3 * 60000, lastActivityAt: now - 3 * 60000  },
  { id: 8,  name: 'Arjun Reddy',   email: 'arjun@example.com',  phone: '+91 98001 88888', status: 'New',            source: 'WhatsApp',     assignedTo: rrId(7), addedAt: now - 2 * 60000, lastActivityAt: now - 2 * 60000  },
  { id: 9,  name: 'Kavita Singh',  email: 'kavita@example.com', phone: '+91 98001 99999', status: 'Demo Scheduled', source: 'Social Media', assignedTo: rrId(8), addedAt: now - 1 * 60000, lastActivityAt: now - 1 * 60000  },
  { id: 10, name: 'Rohit Verma',   email: 'rohit@example.com',  phone: '+91 98001 10101', status: 'New',            source: 'JustDial',     assignedTo: rrId(9), addedAt: now,             lastActivityAt: now               },
];

// ─── Context ──────────────────────────────────────────────────────────────────

const LeadsContext = createContext<LeadsContextType | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads]             = useState<Lead[]>(INITIAL_LEADS);
  const [newArrivals, setNewArrivals] = useState<Lead[]>([]);

  // Track next-ID and round-robin index with refs so callbacks stay stable.
  const nextIdRef  = useRef(INITIAL_LEADS.length + 1);
  const rrIndexRef = useRef(INITIAL_LEADS.length % TELECALLER_POOL.length);

  const addLead = useCallback(
    (data: AddLeadData) => {
      const ts  = Date.now();

      // Round-robin assignment — picks the next telecaller in the pool
      const assignedTo = TELECALLER_POOL[rrIndexRef.current % TELECALLER_POOL.length].id;
      rrIndexRef.current = (rrIndexRef.current + 1) % TELECALLER_POOL.length;

      const newLead: Lead = {
        ...data,
        id:             nextIdRef.current++,
        status:         'New',        // automation rule: always start at New
        assignedTo,
        addedAt:        ts,
        lastActivityAt: ts,
      };
      setLeads(prev => [newLead, ...prev]);
      setNewArrivals(prev => [newLead, ...prev]);
    },
    [], // intentionally empty — refs handle mutable state
  );

  const updateLead = useCallback(
    (id: number, data: Partial<Omit<Lead, 'id' | 'addedAt'>>) => {
      setLeads(prev =>
        prev.map(l =>
          l.id === id ? { ...l, ...data, lastActivityAt: Date.now() } : l,
        ),
      );
    },
    [],
  );

  const deleteLead = useCallback((id: number) => {
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
          if (d.name && d.phone) {
            addLead({
              name:   String(d.name).trim(),
              phone:  String(d.phone).trim(),
              source: (d.source as LeadSource) ?? 'IndiaMart',
              email:  typeof d.email === 'string' ? d.email.trim() : '',
            });
          }
        } catch {
          // ignore malformed event data
        }
      });

      es.onerror = () => {
        // EventSource auto-retries on error — no action needed
      };
    } catch {
      // EventSource not available (SSR / very old browser)
    }

    return () => {
      es?.close();
    };
  }, [addLead]);

  return (
    <LeadsContext.Provider
      value={{ leads, newArrivals, addLead, updateLead, deleteLead, dismissArrivals }}
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
