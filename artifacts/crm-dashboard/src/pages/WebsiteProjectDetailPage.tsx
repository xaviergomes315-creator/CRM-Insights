import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ArrowLeft, Globe, Calendar, User, Tag, Clock,
  Plus, X, ListChecks, FolderOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebsiteProject {
  id: string;
  company_id: string;
  project_name: string;
  client: string;
  website_type: string;
  status: string;
  assigned_to: string;
  deadline: string | null;
  created_at: string;
}

interface ProjectTask {
  id: string;
  project_id: string;
  task_name: string;
  assigned_to: string;
  status: string;
  due_date: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'Planning':    { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400'    },
  'In Progress': { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  'Review':      { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  'Completed':   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'On Hold':     { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-400'     },
};

const TASK_STATUS_OPTIONS = ['Todo', 'In Progress', 'Done'] as const;
type TaskStatus = typeof TASK_STATUS_OPTIONS[number];

const TASK_STATUS_STYLES: Record<TaskStatus, { bg: string; text: string; border: string; dot: string }> = {
  'Todo':        { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400'    },
  'In Progress': { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  'Done':        { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status, styles }: {
  status: string;
  styles: Record<string, { bg: string; text: string; border: string; dot: string }>;
}) {
  const s = styles[status] ?? styles[Object.keys(styles)[0]];
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
      s.bg, s.text, s.border,
    )}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {status}
    </span>
  );
}

function fmt(date: string | null) {
  if (!date) return '—';
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────

interface TaskForm {
  task_name: string;
  assigned_to: string;
  status: string;
  due_date: string;
}

const EMPTY_TASK: TaskForm = {
  task_name:   '',
  assigned_to: '',
  status:      'Todo',
  due_date:    '',
};

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  companyId: string;
}

function AddTaskModal({ open, onClose, onSuccess, projectId, companyId }: AddTaskModalProps) {
  const [form, setForm]             = useState<TaskForm>(EMPTY_TASK);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (open) { setForm(EMPTY_TASK); setError(''); }
  }, [open]);

  if (!open) return null;

  const set = (key: keyof TaskForm, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.task_name.trim()) { setError('Task Name is required.'); return; }

    setError('');
    setSubmitting(true);

    const { error: dbError } = await supabase
      .from('website_project_tasks')
      .insert({
        project_id:  projectId,
        company_id:  companyId,
        task_name:   form.task_name.trim(),
        assigned_to: form.assigned_to.trim(),
        status:      form.status,
        due_date:    form.due_date || null,
      });

    setSubmitting(false);

    if (dbError) { setError(dbError.message); return; }

    onSuccess();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <ListChecks className="h-4 w-4 text-blue-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Add Task</h2>
          </div>
          <button
            type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 px-6 py-5">

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Task Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Task Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.task_name}
              onChange={e => set('task_name', e.target.value)}
              placeholder="e.g. Design homepage mockup"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Assigned To */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Assigned To
            </label>
            <input
              type="text"
              value={form.assigned_to}
              onChange={e => set('assigned_to', e.target.value)}
              placeholder="e.g. Rahul Sharma"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Status
            </label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
            >
              {TASK_STATUS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Due Date
            </label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => set('due_date', e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button" onClick={onClose} disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Add Task
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebsiteProjectDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const { profile } = useAuth();

  const [project,      setProject]      = useState<WebsiteProject | null>(null);
  const [tasks,        setTasks]        = useState<ProjectTask[]>([]);
  const [loadingProj,  setLoadingProj]  = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);

  // ── Fetch project ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoadingProj(true);
    supabase
      .from('website_projects')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); }
        else { setProject(data as WebsiteProject); }
        setLoadingProj(false);
      });
  }, [id]);

  // ── Fetch tasks ────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!id) return;
    setLoadingTasks(true);
    const { data, error } = await supabase
      .from('website_project_tasks')
      .select('id, project_id, task_name, assigned_to, status, due_date, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: true });
    if (!error && data) setTasks(data as ProjectTask[]);
    setLoadingTasks(false);
  }, [id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── Not found ──────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <FolderOpen className="h-12 w-12 text-gray-300" />
        <p className="text-base font-semibold text-gray-600">Project not found.</p>
        <button
          onClick={() => navigate('/website-projects')}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
      </div>
    );
  }

  // ── Loading project skeleton ───────────────────────────────
  if (loadingProj) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-40 rounded bg-gray-100" />
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <div className="h-5 w-64 rounded bg-gray-100" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const tasksDone = tasks.filter(t => t.status === 'Done').length;

  return (
    <div className="space-y-6">

      {/* ── Back nav ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/website-projects')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Website Projects
      </button>

      {/* ── Project info card ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                {project.project_name}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{project.client}</p>
            </div>
          </div>
          <StatusBadge status={project.status} styles={PROJECT_STATUS_STYLES} />
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y md:divide-y-0 divide-gray-100">
          <div className="px-6 py-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              <Tag className="h-3.5 w-3.5" />
              Type
            </div>
            <p className="text-sm font-medium text-gray-800">{project.website_type || '—'}</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              <User className="h-3.5 w-3.5" />
              Assigned To
            </div>
            <p className="text-sm font-medium text-gray-800">{project.assigned_to || '—'}</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Deadline
            </div>
            <p className="text-sm font-medium text-gray-800">{fmt(project.deadline)}</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              <Clock className="h-3.5 w-3.5" />
              Created
            </div>
            <p className="text-sm font-medium text-gray-800">{fmt(project.created_at.split('T')[0])}</p>
          </div>
        </div>
      </div>

      {/* ── Tasks section ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* Section header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <ListChecks className="h-5 w-5 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-800">Tasks</h2>
            {!loadingTasks && tasks.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                {tasksDone}/{tasks.length} done
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Task
          </button>
        </div>

        {/* Tasks table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Task Name', 'Assigned To', 'Status', 'Due Date'].map(col => (
                  <th
                    key={col}
                    scope="col"
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loadingTasks ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[1, 2, 3, 4].map(c => (
                      <td key={c} className="px-5 py-3.5">
                        <div className="h-3.5 rounded bg-gray-100 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ListChecks className="h-8 w-8 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">No tasks yet</p>
                      <p className="text-xs text-gray-400">
                        Click <span className="font-medium">Add Task</span> to create the first one.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                tasks.map((t, idx) => (
                  <tr
                    key={t.id}
                    className={clsx(
                      'transition-colors hover:bg-blue-50/30',
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40',
                    )}
                  >
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">
                      {t.task_name}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {t.assigned_to || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge
                        status={t.status}
                        styles={TASK_STATUS_STYLES as Record<string, typeof TASK_STATUS_STYLES['Todo']>}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">
                      {fmt(t.due_date)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* ── Add Task Modal ─────────────────────────────────────────────────── */}
      {project && (
        <AddTaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={fetchTasks}
          projectId={project.id}
          companyId={project.company_id}
        />
      )}

    </div>
  );
}
