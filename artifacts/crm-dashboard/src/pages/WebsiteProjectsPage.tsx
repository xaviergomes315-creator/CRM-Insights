import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Globe, Plus, X, FolderOpen, Pencil, Eye } from 'lucide-react';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS = ['Project Name', 'Client', 'Status', 'Assigned To', 'Deadline', ''] as const;

const WEBSITE_TYPE_OPTIONS = [
  'Landing Page',
  'Corporate Website',
  'E-Commerce',
  'Portfolio',
  'Blog',
  'Web Application',
  'Other',
] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'Planning':     { bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200',   dot: 'bg-gray-400'   },
  'In Progress':  { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500'   },
  'Review':       { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500'  },
  'Completed':    { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500'},
  'On Hold':      { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200',    dot: 'bg-red-400'    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES['Planning'];
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

function formatDeadline(date: string | null): string {
  if (!date) return '—';
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  'Planning',
  'In Progress',
  'Review',
  'Completed',
  'On Hold',
] as const;

interface ProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId: string | null;
  /** Pass a project to edit; omit (or null) to create a new one. */
  editProject?: WebsiteProject | null;
}

interface ProjectForm {
  project_name: string;
  client: string;
  website_type: string;
  status: string;
  deadline: string;
  assigned_to: string;
}

const EMPTY_FORM: ProjectForm = {
  project_name: '',
  client: '',
  website_type: WEBSITE_TYPE_OPTIONS[0],
  status: 'Planning',
  deadline: '',
  assigned_to: '',
};

function projectToForm(p: WebsiteProject): ProjectForm {
  return {
    project_name: p.project_name,
    client:       p.client,
    website_type: p.website_type || WEBSITE_TYPE_OPTIONS[0],
    status:       p.status,
    deadline:     p.deadline ?? '',
    assigned_to:  p.assigned_to,
  };
}

function ProjectModal({ open, onClose, onSuccess, companyId, editProject }: ProjectModalProps) {
  const isEdit = !!editProject;

  const [form, setForm]             = useState<ProjectForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  // Sync form whenever the modal opens or the target project changes
  useEffect(() => {
    if (open) {
      setForm(editProject ? projectToForm(editProject) : EMPTY_FORM);
      setError('');
    }
  }, [open, editProject]);

  if (!open) return null;

  const set = (key: keyof ProjectForm, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.project_name.trim()) { setError('Project Name is required.'); return; }
    if (!form.client.trim())       { setError('Client is required.'); return; }
    if (!companyId)                { setError('No company associated with your account.'); return; }

    setError('');
    setSubmitting(true);

    let dbError;

    if (isEdit && editProject) {
      ({ error: dbError } = await supabase
        .from('website_projects')
        .update({
          project_name: form.project_name.trim(),
          client:       form.client.trim(),
          website_type: form.website_type,
          status:       form.status,
          deadline:     form.deadline || null,
          assigned_to:  form.assigned_to.trim(),
        })
        .eq('id', editProject.id));
    } else {
      ({ error: dbError } = await supabase
        .from('website_projects')
        .insert({
          company_id:   companyId,
          project_name: form.project_name.trim(),
          client:       form.client.trim(),
          website_type: form.website_type,
          status:       'Planning',
          deadline:     form.deadline || null,
          assigned_to:  form.assigned_to.trim(),
        }));
    }

    setSubmitting(false);

    if (dbError) { setError(dbError.message); return; }

    onSuccess();
    onClose();
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              {isEdit ? <Pencil className="h-4 w-4 text-blue-600" /> : <Globe className="h-4 w-4 text-blue-600" />}
            </div>
            <h2 className="text-base font-bold text-gray-900">
              {isEdit ? 'Edit Project' : 'New Website Project'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
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

          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.project_name}
              onChange={e => set('project_name', e.target.value)}
              placeholder="e.g. Acme Corp Redesign"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Client */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.client}
              onChange={e => set('client', e.target.value)}
              placeholder="e.g. Acme Corporation"
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Website Type */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Website Type
            </label>
            <select
              value={form.website_type}
              onChange={e => set('website_type', e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
            >
              {WEBSITE_TYPE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Status (edit mode only) */}
          {isEdit && (
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
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          {/* Deadline */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Deadline
            </label>
            <input
              type="date"
              value={form.deadline}
              onChange={e => set('deadline', e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors disabled:opacity-60"
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Saving…
                </>
              ) : isEdit ? (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Save Changes
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Create Project
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

export default function WebsiteProjectsPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [projects,       setProjects]       = useState<WebsiteProject[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingProject, setEditingProject] = useState<WebsiteProject | null>(null);

  const openCreate = () => { setEditingProject(null); setModalOpen(true); };
  const openEdit   = (p: WebsiteProject) => { setEditingProject(p); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingProject(null); };

  const fetchProjects = useCallback(async () => {
    if (!profile?.company_id) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('website_projects')
      .select('id, company_id, project_name, client, website_type, status, assigned_to, deadline, created_at')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });
    if (!error && data) setProjects(data as WebsiteProject[]);
    setLoading(false);
  }, [profile?.company_id]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  return (
    <div className="space-y-6">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
            <Globe className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Website Projects</h1>
            <p className="text-sm text-gray-500">Track and manage client website projects</p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col}
                    scope="col"
                    className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                /* Skeleton rows */
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {COLUMNS.map(col => (
                      <td key={col} className="px-5 py-4">
                        <div className="h-3.5 rounded bg-gray-100 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : projects.length === 0 ? (
                /* Empty state */
                <tr>
                  <td colSpan={COLUMNS.length} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <FolderOpen className="h-6 w-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-700">No projects yet</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Click <span className="font-medium">New Project</span> to add the first one.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                /* Data rows */
                projects.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={clsx(
                      'transition-colors hover:bg-blue-50/40',
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                    )}
                  >
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{p.project_name}</p>
                        {p.website_type && (
                          <p className="text-xs text-gray-400 mt-0.5">{p.website_type}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-700">
                      {p.client || '—'}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-700">
                      {p.assigned_to || '—'}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDeadline(p.deadline)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/website-projects/${p.id}`)}
                          title="View project"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          title="Edit project"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!loading && projects.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Modal (create + edit) ──────────────────────────────────────────── */}
      <ProjectModal
        open={modalOpen}
        onClose={closeModal}
        onSuccess={fetchProjects}
        companyId={profile?.company_id ?? null}
        editProject={editingProject}
      />

    </div>
  );
}
