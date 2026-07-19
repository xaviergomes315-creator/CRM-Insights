import { Globe, Plus } from 'lucide-react';

// ─── Column definition ────────────────────────────────────────────────────────

const COLUMNS = [
  'Project Name',
  'Client',
  'Status',
  'Assigned To',
  'Deadline',
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebsiteProjectsPage() {
  return (
    <div className="space-y-6">

      {/* Page header */}
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
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {COLUMNS.map((col) => (
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
              {/* Empty state */}
              <tr>
                <td colSpan={COLUMNS.length} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <Globe className="h-6 w-6 text-gray-400" />
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
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
