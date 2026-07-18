/**
 * @deprecated
 * This file is a compatibility shim. All auth and role logic has moved to
 * AuthContext.tsx. Import from '@/contexts/AuthContext' directly.
 */
export {
  useAuth as useUser,
  AuthProvider as UserProvider,
  maskPhone,
} from './AuthContext';
