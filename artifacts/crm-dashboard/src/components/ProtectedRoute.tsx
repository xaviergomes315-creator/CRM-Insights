import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import React from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // Ye naya feature hai: Hum pages ko specific roles ke liye lock kar sakte hain
  allowedRoles?: Array<'super_admin' | 'company_admin' | 'manager' | 'employee'>;
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, isLoading } = useAuth();

  // 1. Jab tak user ka data database se aa raha hai, loading screen dikhao
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-gray-500 font-medium">Loading Enterprise Workspace...</p>
        </div>
      </div>
    );
  }

  // 2. Agar login nahi kiya hai, toh Login page par phenk do
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // 3. Agar page par role restriction hai aur user ka role match nahi karta
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    console.warn(`Access denied. User role '${profile.role}' lacks permission.`);
    return <Navigate to="/" replace />; // Unauthorized access ko home par bhej do
  }

  // 4. Sab sahi hai toh page dikha do
  return <>{children}</>;
}
