'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentPath, redirectToLogin } from '../navigation';
import { getAccessToken } from './accessToken';
import { refreshSession } from './refreshSession';

/**
 * - `checking`:      the initial session check is running (also the server-rendered state).
 * - `authenticated`: an access token is available in memory.
 * - `redirecting`:   the backend rejected the session; the user is sent to the login page.
 * - `error`:         the session could not be verified (server or network error).
 */
export type SessionGuardStatus = 'checking' | 'authenticated' | 'redirecting' | 'error';

export type SessionGuard = {
  status: SessionGuardStatus;
  /** Runs the session check again; only meant for an explicit user action after an error. */
  retry: () => void;
};

/**
 * Determines whether protected content may be shown.
 *
 * An access token in memory is used as is: the backend validates it (and the current user
 * status) on every protected API request. Without a token, e.g. after a page reload or direct
 * navigation, the session is restored once through the HttpOnly refresh cookie using the shared,
 * single-flight `refreshSession()`. Server and network errors are never retried automatically.
 */
export function useSessionGuard(): SessionGuard {
  // Always start in `checking`: the server render and the first client render must match, and
  // the in-memory token is only read in the browser.
  const [status, setStatus] = useState<SessionGuardStatus>('checking');
  const [attempt, setAttempt] = useState(0);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      if (getAccessToken()) {
        setStatus('authenticated');
        return;
      }

      setStatus('checking');
      const result = await refreshSession();

      if (!active) {
        return;
      }

      if (result.ok) {
        setStatus('authenticated');
        return;
      }

      if (result.error === 'unauthenticated') {
        setStatus('redirecting');
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          redirectToLogin(getCurrentPath());
        }
        return;
      }

      setStatus('error');
    }

    void verifySession();

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return { status, retry };
}
