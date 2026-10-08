'use client';

import type { ReactNode } from 'react';
import { Alert, Button } from '../../../components/ui';
import { SESSION_GUARD_MESSAGES } from '../messages';
import { useSessionGuard } from '../session/useSessionGuard';

function SessionCheckScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">{children}</div>
    </main>
  );
}

/**
 * Client-side guard for protected pages.
 *
 * Children are only rendered after a usable session has been established; until then a neutral
 * loading state is shown (also during server rendering and hydration). This guard improves the
 * user experience only: access to data and actions is enforced by the backend.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, retry } = useSessionGuard();

  if (status === 'authenticated') {
    return children;
  }

  if (status === 'error') {
    return (
      <SessionCheckScreen>
        <Alert variant="warning">{SESSION_GUARD_MESSAGES.error}</Alert>
        <Button onClick={retry}>Opnieuw proberen</Button>
      </SessionCheckScreen>
    );
  }

  return (
    <SessionCheckScreen>
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
      />
      <p role="status" className="text-sm text-secondary-500">
        {status === 'redirecting'
          ? SESSION_GUARD_MESSAGES.redirecting
          : SESSION_GUARD_MESSAGES.checking}
      </p>
    </SessionCheckScreen>
  );
}
