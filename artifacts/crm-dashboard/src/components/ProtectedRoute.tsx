import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth, UserRole } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  /**
   * Render explicit children instead of <Outlet />.
   * When used as a React Router layout route (`<Route element={<ProtectedRoute />}>`),
   * omit this — nested routes are served via <Outlet />.
   */
  children?: React.ReactNode;

  /**
   * Restrict access to specific roles.
   * If the authenticated user's role is not in this list, they are redirected to "/".
   */
  allowedRoles?: UserRole[];

  /**
   * Shorthand for allowedRoles: ['super_admin', 'company_admin'].
   * Takes precedence over allowedRoles when both are provided.
   */
  adminOnly?: boolean;
}

// ─── Admin roles constant ─────────────────────────────────────────────────────

const ADMIN_ROLES: UserRole[] = ["super_admin", "company_admin"];

// ─── Loading screen ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50/50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-gray-500">
          Loading Enterprise Workspace…
        </p>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProtectedRoute({
  children,
  allowedRoles,
  adminOnly = false,
}: ProtectedRouteProps) {
  const { session, profile, isLoading } = useAuth();

  // 1. Show a loading screen while session / profile is being resolved.
  //    This prevents a flash-redirect to /login on hard refresh.
  if (isLoading) {
    return <LoadingScreen />;
  }

  // 2. Not authenticated — redirect to login.
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // 3. Determine which roles are required for this route.
  const requiredRoles: UserRole[] | undefined = adminOnly
    ? ADMIN_ROLES
    : allowedRoles;

  // 4. Role check.
  //    If a role restriction is active we MUST have the profile loaded before
  //    granting access. Denying when profile is null closes the window where a
  //    slow DB round-trip could let an unauthenticated role slip through.
  if (requiredRoles && requiredRoles.length > 0) {
    if (!profile) {
      // Profile is still loading (fetchProfile is retrying in the background).
      // Show the loading screen rather than flashing an unauthorized redirect.
      return <LoadingScreen />;
    }

    if (!requiredRoles.includes(profile.role)) {
      console.warn(
        `[ProtectedRoute] Access denied. Role "${profile.role}" is not in [${requiredRoles.join(", ")}].`,
      );
      return <Navigate to="/" replace />;
    }
  }

  // 5. Authorized — render children or the nested route outlet.
  return <>{children ?? <Outlet />}</>;
}

// Named re-export for consumers that prefer the named import style.
export { ProtectedRoute };
