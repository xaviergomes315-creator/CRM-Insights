/**
 * UnauthorizedPage — shown when an authenticated user's profile is missing
 * or their role is not recognised by the application.
 */
import { ShieldX } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function UnauthorizedPage() {
  const { signOut, profile } = useAuth();

  const message = profile
    ? `Your account role "${profile.role.replace(/_/g, ' ')}" does not have access to this application.`
    : 'Your account does not have an assigned role. Please contact your administrator.';

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ShieldX className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Unauthorized</h1>
        <p className="text-sm text-gray-500">{message}</p>
        <button
          onClick={signOut}
          className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
