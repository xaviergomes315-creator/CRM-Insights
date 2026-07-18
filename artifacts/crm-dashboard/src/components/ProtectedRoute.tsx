import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  /** When true, only Admins may access; Telecallers are redirected to /. */
  adminOnly?: boolean;
}

/**
 * Wrap routes that require authentication.
 * Renders <Outlet /> when access is granted.
 *
 * Usage in App.tsx:
 *   <Route element={<ProtectedRoute />}>          — any logged-in user
 *     <Route element={<DashboardLayout />}>
 *       ...
 *       <Route element={<ProtectedRoute adminOnly />}>   — Admin only
 *         <Route path="/admin" element={<AdminPage />} />
 *       </Route>
 *     </Route>
 *   </Route>
 */
export default function ProtectedRoute({ adminOnly = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  // Not logged in → send to /login, preserving intended destination
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in but wrong role for adminOnly route → home
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
