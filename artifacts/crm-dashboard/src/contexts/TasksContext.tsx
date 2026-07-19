import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { supabase, type TaskRow } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task {
  id:           number;
  leadId:       number;
  leadName:     string;
  leadPhone:    string;
  followUpDate: string; // YYYY-MM-DD
  followUpTime: string; // HH:MM
  note:         string;
  done:         boolean;
}

interface TasksContextType {
  tasks:      Task[];
  loading:    boolean;
  addTask:    (data: Omit<Task, 'id' | 'done'>) => Promise<void>;
  updateTask: (id: number, data: Partial<Omit<Task, 'id'>>) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  markDone:   (id: number) => Promise<void>;
}

// ─── Row ↔ Task mappers ───────────────────────────────────────────────────────

function rowToTask(row: TaskRow): Task {
  return {
    id:           row.id,
    leadId:       row.lead_id,
    leadName:     row.lead_name,
    leadPhone:    row.lead_phone,
    followUpDate: row.follow_up_date,
    followUpTime: row.follow_up_time,
    note:         row.note,
    done:         row.done,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TasksContext = createContext<TasksContextType | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('follow_up_date', { ascending: true })
        .order('follow_up_time', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('[TasksContext] initial load error', error);
        toast.error('Could not load tasks', { description: error.message });
        setLoading(false);
        return;
      }

      setTasks((data as TaskRow[]).map(rowToTask));
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const addTask = useCallback(async (data: Omit<Task, 'id' | 'done'>) => {
    const row: Omit<TaskRow, 'id'> = {
      lead_id:        data.leadId,
      lead_name:      data.leadName,
      lead_phone:     data.leadPhone,
      follow_up_date: data.followUpDate,
      follow_up_time: data.followUpTime,
      note:           data.note,
      done:           false,
    };

    const { data: inserted, error } = await supabase
      .from('tasks')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('[TasksContext] addTask error', error);
      toast.error('Failed to add task', { description: error.message });
      return;
    }

    setTasks(prev => [...prev, rowToTask(inserted as TaskRow)]);
  }, []);

  const updateTask = useCallback(
    async (id: number, data: Partial<Omit<Task, 'id'>>) => {
      const patch: Partial<TaskRow> = {};
      if (data.leadId       !== undefined) patch.lead_id        = data.leadId;
      if (data.leadName     !== undefined) patch.lead_name      = data.leadName;
      if (data.leadPhone    !== undefined) patch.lead_phone     = data.leadPhone;
      if (data.followUpDate !== undefined) patch.follow_up_date = data.followUpDate;
      if (data.followUpTime !== undefined) patch.follow_up_time = data.followUpTime;
      if (data.note         !== undefined) patch.note           = data.note;
      if (data.done         !== undefined) patch.done           = data.done;

      const { error } = await supabase.from('tasks').update(patch).eq('id', id);

      if (error) {
        console.error('[TasksContext] updateTask error', error);
        toast.error('Failed to update task', { description: error.message });
        return;
      }

      setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...data } : t)));
    },
    [],
  );

  const deleteTask = useCallback(async (id: number) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);

    if (error) {
      console.error('[TasksContext] deleteTask error', error);
      toast.error('Failed to delete task', { description: error.message });
      return;
    }

    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const markDone = useCallback(async (id: number) => {
    const { error } = await supabase
      .from('tasks')
      .update({ done: true })
      .eq('id', id);

    if (error) {
      console.error('[TasksContext] markDone error', error);
      toast.error('Failed to mark task done', { description: error.message });
      return;
    }

    setTasks(prev => prev.map(t => (t.id === id ? { ...t, done: true } : t)));
  }, []);

  return (
    <TasksContext.Provider value={{ tasks, loading, addTask, updateTask, deleteTask, markDone }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside <TasksProvider>');
  return ctx;
}
