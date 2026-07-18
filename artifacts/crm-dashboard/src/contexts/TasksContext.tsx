import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task {
  id: number;
  leadId: number;
  leadName: string;
  leadPhone: string;
  followUpDate: string; // YYYY-MM-DD
  followUpTime: string; // HH:MM
  note: string;
  done: boolean;
}

interface TasksContextType {
  tasks: Task[];
  addTask: (data: Omit<Task, 'id' | 'done'>) => void;
  updateTask: (id: number, data: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (id: number) => void;
  markDone: (id: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TasksContext = createContext<TasksContextType | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [nextId, setNextId] = useState(1);

  const addTask = useCallback(
    (data: Omit<Task, 'id' | 'done'>) => {
      const task: Task = { ...data, id: nextId, done: false };
      setTasks(prev => [...prev, task]);
      setNextId(n => n + 1);
    },
    [nextId],
  );

  const updateTask = useCallback((id: number, data: Partial<Omit<Task, 'id'>>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...data } : t)));
  }, []);

  const deleteTask = useCallback((id: number) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const markDone = useCallback((id: number) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, done: true } : t)));
  }, []);

  return (
    <TasksContext.Provider value={{ tasks, addTask, updateTask, deleteTask, markDone }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside <TasksProvider>');
  return ctx;
}
