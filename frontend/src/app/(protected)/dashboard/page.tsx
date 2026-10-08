import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — Nimbus',
};

/*
 * Temporary redirect destination after a successful login (Issue #1).
 * Protected by the (protected) route group layout (Issue #18). The real Dashboard implementation
 * belongs to its own story: no dashboard features, API calls or current-user data here.
 */
export default function DashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <h1 className="text-2xl leading-[1.3] font-bold text-secondary-900">Dashboard</h1>
    </main>
  );
}
