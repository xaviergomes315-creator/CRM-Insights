import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type LeadSource = 'WhatsApp' | 'Website' | 'IndiaMart' | 'JustDial' | 'Social Media';
export type LeadStatus = 'New' | 'Interested' | 'Demo Scheduled' | 'Closed';

export interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: LeadSource;
  addedAt: number; // Unix ms timestamp — used by Live Feed sort
}

interface LeadsContextType {
  leads: Lead[];
  /** New leads added in the current session (cleared by dismissArrivals). */
  newArrivals: Lead[];
  /**
   * Automation rule: addLead ALWAYS forces status → 'New',
   * regardless of what the caller passes.
   */
  addLead: (data: Omit<Lead, 'id' | 'status' | 'addedAt'>) => void;
  updateLead: (id: number, data: Partial<Omit<Lead, 'id' | 'addedAt'>>) => void;
  deleteLead: (id: number) => void;
  /** Call after the Telecaller alert has been shown to reset the badge. */
  dismissArrivals: () => void;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const now = Date.now();

const INITIAL_LEADS: Lead[] = [
  { id: 1,  name: 'Priya Sharma',  email: 'priya@example.com',  phone: '+91 98001 11111', status: 'New',       source: 'IndiaMart',    addedAt: now - 9 * 60000 },
  { id: 2,  name: 'Rahul Mehta',   email: 'rahul@example.com',  phone: '+91 98001 22222', status: 'Interested', source: 'WhatsApp',     addedAt: now - 8 * 60000 },
  { id: 3,  name: 'Anita Desai',   email: 'anita@example.com',  phone: '+91 98001 33333', status: 'Closed',    source: 'Website',      addedAt: now - 7 * 60000 },
  { id: 4,  name: 'Vikram Nair',   email: 'vikram@example.com', phone: '+91 98001 44444', status: 'New',       source: 'JustDial',     addedAt: now - 6 * 60000 },
  { id: 5,  name: 'Sunita Patel',  email: 'sunita@example.com', phone: '+91 98001 55555', status: 'Interested', source: 'Social Media', addedAt: now - 5 * 60000 },
  { id: 6,  name: 'Deepak Kumar',  email: 'deepak@example.com', phone: '+91 98001 66666', status: 'New',       source: 'IndiaMart',    addedAt: now - 4 * 60000 },
  { id: 7,  name: 'Meena Joshi',   email: 'meena@example.com',  phone: '+91 98001 77777', status: 'Closed',    source: 'Website',      addedAt: now - 3 * 60000 },
  { id: 8,  name: 'Arjun Reddy',   email: 'arjun@example.com',  phone: '+91 98001 88888', status: 'New',       source: 'WhatsApp',     addedAt: now - 2 * 60000 },
  { id: 9,  name: 'Kavita Singh',  email: 'kavita@example.com', phone: '+91 98001 99999', status: 'Demo Scheduled', source: 'Social Media', addedAt: now - 1 * 60000 },
  { id: 10, name: 'Rohit Verma',   email: 'rohit@example.com',  phone: '+91 98001 10101', status: 'New',       source: 'JustDial',     addedAt: now },
];

// ─── Context ──────────────────────────────────────────────────────────────────

const LeadsContext = createContext<LeadsContextType | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads]             = useState<Lead[]>(INITIAL_LEADS);
  const [newArrivals, setNewArrivals] = useState<Lead[]>([]);
  const [nextId, setNextId]           = useState(INITIAL_LEADS.length + 1);

  const addLead = useCallback((data: Omit<Lead, 'id' | 'status' | 'addedAt'>) => {
    const newLead: Lead = {
      ...data,
      id:      nextId,
      status:  'New',        // ← Automation rule: always force New
      addedAt: Date.now(),
    };
    setLeads(prev => [newLead, ...prev]);
    setNewArrivals(prev => [newLead, ...prev]);
    setNextId(n => n + 1);
  }, [nextId]);

  const updateLead = useCallback((id: number, data: Partial<Omit<Lead, 'id' | 'addedAt'>>) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
  }, []);

  const deleteLead = useCallback((id: number) => {
    setLeads(prev => prev.filter(l => l.id !== id));
  }, []);

  const dismissArrivals = useCallback(() => setNewArrivals([]), []);

  return (
    <LeadsContext.Provider value={{ leads, newArrivals, addLead, updateLead, deleteLead, dismissArrivals }}>
      {children}
    </LeadsContext.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error('useLeads must be used inside <LeadsProvider>');
  return ctx;
}
