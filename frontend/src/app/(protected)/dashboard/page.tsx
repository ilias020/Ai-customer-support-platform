import type { Metadata } from 'next';
import { LogoutButton } from '../../../features/auth/components/LogoutButton';
import { RegistrationWelcomeNotice } from '../../../features/auth/components/RegistrationWelcomeNotice';

export const metadata: Metadata = {
  title: 'Dashboard — Nimbus',
};

/*
 * Temporary redirect destination after a successful login (Issue #1).
 * Protected by the (protected) route group layout (Issue #18). The real Dashboard implementation
 * belongs to its own story. After a registration it shows a one-time welcome notice (Issue #11).
 * The logout action (Issue #13) sits in a minimal header until the dashboard navigation exists.
 */
export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex justify-end px-4 pt-4 md:px-6 md:pt-6">
        <LogoutButton />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-16">
        <RegistrationWelcomeNotice />
        <h1 className="text-2xl leading-[1.3] font-bold text-secondary-900">Dashboard</h1>
      </main>
    </div>
  );
}
