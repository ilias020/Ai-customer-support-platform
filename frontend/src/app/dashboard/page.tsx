import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — Nimbus',
};

/*
 * Temporary redirect destination after a successful login (Issue #1).
 * The real Dashboard implementation is out of scope for Issue #1 and belongs to its own story:
 * no dashboard features, API calls, route guard or current-user data here.
 */
export default function DashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <h1 className="text-2xl leading-[1.3] font-bold text-secondary-900">Dashboard</h1>
    </main>
  );
}
