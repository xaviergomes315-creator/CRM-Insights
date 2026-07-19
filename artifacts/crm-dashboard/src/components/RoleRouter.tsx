/**
 * RoleRouter — reads the authenticated user's role and redirects to the
 * appropriate dashboard. Rendered at the root "/" route inside ProtectedRoute
 * (which already handles the isLoading / unauthenticated cases).
 *
 * By the time this component renders, AuthContext has already called
 * onboard_user() — so profile should always be populated. A null profile
 * here means the RPC call failed (network error, Supabase unreachable, etc.),
 * NOT that the user is unauthorised.
 *
 * Role → destination mapping:
 *   super_admin / company_admin  →  /admin        (AdminPage)
 *   employee                     →  /telecaller   (TelecallerPage)
 *   manager                      →  renders Dashboard (Employee Dashboard)
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from '@/pages/Dashboard';

export default function RoleRouter() {
  const { profile } = useAuth();

  // Onboarding RPC failed — show a recovery UI rather than /unauthorized,
  // which is reserved for users whose roles are explicitly not permitted.
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

  switch (profile.role) {
    case 'super_admin':
    case 'company_admin':
      return <Navigate to="/admin" replace />;

    case 'employee':
      return <Navigate to="/telecaller" replace />;

    case 'manager':
      // Manager Dashboard — reuses the general Dashboard component.
      return <Dashboard />;

    default:
      // A role value the application does not recognise — genuinely unauthorised.
      return <Navigate to="/unauthorized" replace />;
  }
}
