import { requestTokenRefresh, type RefreshResult } from '../api/refresh';
import { clearAccessToken, setAccessToken } from './accessToken';

/** Name of the Web Lock that serializes refreshes across browser tabs of this origin. */
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

async function runExclusiveAcrossTabs(task: () => Promise<RefreshResult>): Promise<RefreshResult> {
  // The backend rotates the refresh token on every refresh, so two tabs refreshing at the same
  // time with the same cookie would make one of them fail. The Web Locks API runs refreshes of
  // all tabs one after another; each refresh then sends the cookie rotated by the previous one.
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;

  if (!locks) {
    return task();
  }

  let result: RefreshResult | undefined;
  await locks.request(REFRESH_LOCK_NAME, async () => {
    result = await task();
  });

  return result as RefreshResult;
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
