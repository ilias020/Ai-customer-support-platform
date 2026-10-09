'use client';

import { useCallback, useEffect, useState } from 'react';
import { type CurrentUser, fetchCurrentUser } from '../api/currentUser';

/**
 * - `loading`:         the session and current user are being verified (also the server render).
 * - `authenticated`:   `GET /api/users/me` confirmed the current user.
 * - `unauthenticated`: the backend rejected the session; the user is sent to the login page.
 * - `error`:           the user could not be verified (server, network or invalid response).
 */
export type SessionGuardStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export type SessionGuardState =
  | { status: 'authenticated'; user: CurrentUser }
  | { status: Exclude<SessionGuardStatus, 'authenticated'>; user: null };

export type SessionGuard = SessionGuardState & {
  /** Runs the verification again; only meant for an explicit user action after an error. */
  retry: () => void;
};

/**
 * Determines whether protected content may be shown and which user is authenticated.
 *
 * An access token in memory alone is not sufficient: the current user is always confirmed by
 * `GET /api/users/me`. That request goes through `authenticatedFetch`, which restores a missing
 * token via the HttpOnly refresh cookie (e.g. after a page reload), renews an expired token and
 * retries once. When the backend rejects the session, `authenticatedFetch` clears the token and
 * redirects to login with the current page as return path. Server, network and invalid-response
 * errors are never retried automatically.
 */
export function useSessionGuard(): SessionGuard {
  // Always start in `loading`: the server render and the first client render must match.
  const [state, setState] = useState<SessionGuardState>({ status: 'loading', user: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      const result = await fetchCurrentUser();

      // Ignore results for an unmounted guard or a superseded attempt.
      if (!active) {
        return;
      }

      if (result.ok) {
        setState({ status: 'authenticated', user: result.user });
      } else if (result.error === 'unauthenticated') {
        setState({ status: 'unauthenticated', user: null });
      } else {
        setState({ status: 'error', user: null });
      }
    }

    void verifySession();

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading', user: null });
    setAttempt((current) => current + 1);
  }, []);

  return { ...state, retry };
}
