import type { Metadata } from 'next';

import { RegistrationWelcomeNotice } from '../../../features/auth/components/RegistrationWelcomeNotice';

export const metadata: Metadata = {
  title: 'Dashboard — Nimbus',
};

/*
 * Temporary redirect destination after a successful login (Issue #1).
 * Protected by the (protected) route group layout (Issue #18). The real Dashboard implementation
 * belongs to its own story. After a registration it shows a one-time welcome notice (Issue #11).
 */
export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <RegistrationWelcomeNotice />
      <h1 className="text-2xl leading-[1.3] font-bold text-secondary-900">Dashboard</h1>
    </main>
  );
}
