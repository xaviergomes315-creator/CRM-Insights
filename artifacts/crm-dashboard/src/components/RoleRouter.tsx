/**
 * RoleRouter — reads the authenticated user's role and redirects to the
 * appropriate dashboard. Rendered at the root "/" route inside ProtectedRoute
 * (which already handles the isLoading / unauthenticated cases).
 *
 * Role → destination mapping:
 *   super_admin / company_admin  →  /admin        (AdminPage)
 *   employee                     →  /telecaller   (TelecallerPage)
 *   manager                      →  renders Dashboard (Employee Dashboard)
 *   null profile / unknown       →  /unauthorized
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from '@/pages/Dashboard';

export default function RoleRouter() {
  const { profile } = useAuth();

  // profile is null when the fetch failed or role is missing.
  if (!profile) {
    return <Navigate to="/unauthorized" replace />;
  }

  switch (profile.role) {
    case 'super_admin':
    case 'company_admin':
      return <Navigate to="/admin" replace />;

    case 'employee':
      return <Navigate to="/telecaller" replace />;

    case 'manager':
      // Employee Dashboard — reuses the general Dashboard component.
      return <Dashboard />;

    default:
      return <Navigate to="/unauthorized" replace />;
  }
}
