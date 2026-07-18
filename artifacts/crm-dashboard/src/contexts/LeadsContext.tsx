import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

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
  addedAt:        number; // Unix ms — used by Live Feed sort
  lastActivityAt: number; // Unix ms — updated on every mutation; used for idle detection
}

interface LeadsContextType {
  leads:           Lead[];
  newArrivals:     Lead[];
  addLead:         (data: Omit<Lead, 'id' | 'status' | 'addedAt' | 'lastActivityAt'>) => void;
  updateLead:      (id: number, data: Partial<Omit<Lead, 'id' | 'addedAt'>>) => void;
  deleteLead:      (id: number) => void;
  dismissArrivals: () => void;
}

// ─── Idle lead helpers ────────────────────────────────────────────────────────
//
// A lead is "idle" when:
//   • Its status is 'New' or 'Interested'      (still in early funnel)
//   • It has had no activity for 48+ hours     (no status change / edit)
//
// The badge and Drip button are shown wherever lead cards are rendered.

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

const now  = Date.now();
const IDLE = now - 50 * 60 * 60 * 1000; // 50 h ago → triggers "Urgent Follow-up"

const INITIAL_LEADS: Lead[] = [
  { id: 1,  name: 'Priya Sharma',  email: 'priya@example.com',  phone: '+91 98001 11111', status: 'New',            source: 'IndiaMart',    addedAt: now - 9 * 60000, lastActivityAt: IDLE              },
  { id: 2,  name: 'Rahul Mehta',   email: 'rahul@example.com',  phone: '+91 98001 22222', status: 'Interested',     source: 'WhatsApp',     addedAt: now - 8 * 60000, lastActivityAt: now - 8 * 60000  },
  { id: 3,  name: 'Anita Desai',   email: 'anita@example.com',  phone: '+91 98001 33333', status: 'Closed',         source: 'Website',      addedAt: now - 7 * 60000, lastActivityAt: now - 7 * 60000  },
  { id: 4,  name: 'Vikram Nair',   email: 'vikram@example.com', phone: '+91 98001 44444', status: 'New',            source: 'JustDial',     addedAt: now - 6 * 60000, lastActivityAt: IDLE              },
  { id: 5,  name: 'Sunita Patel',  email: 'sunita@example.com', phone: '+91 98001 55555', status: 'Interested',     source: 'Social Media', addedAt: now - 5 * 60000, lastActivityAt: IDLE              },
  { id: 6,  name: 'Deepak Kumar',  email: 'deepak@example.com', phone: '+91 98001 66666', status: 'New',            source: 'IndiaMart',    addedAt: now - 4 * 60000, lastActivityAt: now - 4 * 60000  },
  { id: 7,  name: 'Meena Joshi',   email: 'meena@example.com',  phone: '+91 98001 77777', status: 'Closed',         source: 'Website',      addedAt: now - 3 * 60000, lastActivityAt: now - 3 * 60000  },
  { id: 8,  name: 'Arjun Reddy',   email: 'arjun@example.com',  phone: '+91 98001 88888', status: 'New',            source: 'WhatsApp',     addedAt: now - 2 * 60000, lastActivityAt: now - 2 * 60000  },
  { id: 9,  name: 'Kavita Singh',  email: 'kavita@example.com', phone: '+91 98001 99999', status: 'Demo Scheduled', source: 'Social Media', addedAt: now - 1 * 60000, lastActivityAt: now - 1 * 60000  },
  { id: 10, name: 'Rohit Verma',   email: 'rohit@example.com',  phone: '+91 98001 10101', status: 'New',            source: 'JustDial',     addedAt: now,             lastActivityAt: now               },
];

// ─── Context ──────────────────────────────────────────────────────────────────

const LeadsContext = createContext<LeadsContextType | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads]         = useState<Lead[]>(INITIAL_LEADS);
  const [newArrivals, setNewArrivals] = useState<Lead[]>([]);

  // Use a ref for nextId so addLead can be a stable (empty-deps) callback.
  // This lets the SSE useEffect hold a reference without ever going stale.
  const nextIdRef = useRef(INITIAL_LEADS.length + 1);

  const addLead = useCallback(
    (data: Omit<Lead, 'id' | 'status' | 'addedAt' | 'lastActivityAt'>) => {
      const ts      = Date.now();
      const newLead: Lead = {
        ...data,
        id:             nextIdRef.current++,
        status:         'New',   // Automation rule: always force New
        addedAt:        ts,
        lastActivityAt: ts,
      };
      setLeads(prev => [newLead, ...prev]);
      setNewArrivals(prev => [newLead, ...prev]);
    },
    [], // intentionally empty — nextIdRef.current handles ID generation
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
  // Vite proxies /api → http://localhost:8080, so this works in both dev and
  // through Replit's preview proxy without hard-coding a domain or port.

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
