/**
 * RoleRouter — rendered at the root "/" route inside ProtectedRoute.
 *
 * Every authenticated user lands on the main Dashboard regardless of role.
 * The Dashboard itself renders role-appropriate content (admin stats &
 * leaderboard for admins, personal pipeline for employees, etc.).
 *
 * The Admin Panel (/admin) is intentionally reachable only via the sidebar
 * link that is gated to company_admin / super_admin — not via an automatic
 * redirect here.
 *
 * A null profile means onboard_user() RPC failed (network/Supabase issue),
 * NOT that the user is unauthorised. Show a recovery UI rather than
 * bouncing to /unauthorized.
 */
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from '@/pages/Dashboard';

export default function RoleRouter() {
  const { profile } = useAuth();

  // onboard_user() RPC failure — show a graceful recovery screen.
  // /unauthorized is reserved for explicitly rejected roles only.
  if (!profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-gray-600">
            Setting up your workspace…
          </p>
          <p className="text-xs text-gray-400">
            This only takes a moment. If it hangs, try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // All roles — company_admin, super_admin, manager, employee — land on
  // the shared Dashboard. The Dashboard reads `isAdmin` / `isTelecaller`
  // from AuthContext and adjusts its content accordingly.
  if (
    profile.role === 'super_admin' ||
    profile.role === 'company_admin' ||
    profile.role === 'manager' ||
    profile.role === 'employee'
  ) {
    return <Dashboard />;
  }

  // Unrecognised role value — genuinely unauthorised.
  // (In practice onboard_user() always assigns a valid role, so this
  //  branch is only reached if the DB is manually put into a bad state.)
  import('react-router-dom').then(({ Navigate }) => {});   // tree-shake hint
  return null; // ProtectedRoute will redirect to /unauthorized on its own re-render
}
