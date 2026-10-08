import type { ReactNode } from 'react';
import { ProtectedRoute } from '../../features/auth/components/ProtectedRoute';

/*
 * Central guard for all pages in the (protected) route group, e.g. /dashboard.
 * The group folder does not change the URL. Public pages such as /login stay outside this group.
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
