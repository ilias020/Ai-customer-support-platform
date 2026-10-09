import { requestTokenRefresh, type RefreshResult } from '../api/refresh';
import { clearAccessToken, setAccessToken } from './accessToken';

/** Name of the Web Lock that serializes refreshes and logins across browser tabs of this origin. */
export const REFRESH_LOCK_NAME = 'nimbus-auth-refresh';

let refreshInFlight: Promise<RefreshResult> | null = null;

async function performRefresh(): Promise<RefreshResult> {
  const result = await requestTokenRefresh();

  if (result.ok) {
    setAccessToken(result.accessToken);
  } else if (result.error === 'unauthenticated') {
    // Only a refresh rejected by the backend (401) ends the session. Server and network
    // errors keep the current state, because the session has not been confirmed invalid.
    clearAccessToken();
  }

  return result;
}

/**
 * Runs `task` while holding the Web Lock that is shared by all tabs of this origin.
 *
 * The backend rotates the refresh token on every refresh and sets a new refresh cookie on every
 * login. Running refreshes and logins one after another ensures that each request sends the
 * cookie set by the previous one, and that a slow refresh can never overwrite the cookie (or the
 * access token) of a newer login with that of the previous session.
 */
export async function runExclusiveAcrossTabs<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;

  if (!locks) {
    return task();
  }

  let result: T | undefined;
  await locks.request(REFRESH_LOCK_NAME, async () => {
    result = await task();
  });

  return result as T;
}

/**
 * Refreshes the session at most once at a time within this page: concurrent callers share the
 * same in-flight refresh and its result.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = runExclusiveAcrossTabs(performRefresh).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}
