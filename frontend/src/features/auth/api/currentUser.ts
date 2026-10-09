import { getAccessToken, getSessionVersion } from '../session/accessToken';
import {
  authenticatedFetch,
  SessionRefreshError,
  UnauthenticatedError,
} from './authenticatedFetch';

export const CURRENT_USER_ENDPOINT = '/api/users/me';

/** Response of `GET /api/users/me` (Issue #19): a flat object without a `data` wrapper. */
export type CurrentUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: 'ACTIVE';
  language: string;
  timezone: string;
  last_login_at: string | null;
  created_at: string;
};

/**
 * - `unauthenticated`:  the backend rejected the session (refresh 401); the session has ended.
 * - `server`/`network`: the user could not be verified; the session is kept.
 * - `invalid_response`: `/me` answered 200 with a body that is not a valid user.
 */
export type CurrentUserErrorKind = 'unauthenticated' | 'server' | 'network' | 'invalid_response';

export type CurrentUserResult =
  { ok: true; user: CurrentUser } | { ok: false; error: CurrentUserErrorKind };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Validates a `/me` response body and returns a copy that contains only the nine contract
 * fields, so unexpected properties are never stored in application state.
 */
export function parseCurrentUser(value: unknown): CurrentUser | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;

  if (
    !isNonEmptyString(body.id) ||
    !isNonEmptyString(body.email) ||
    typeof body.first_name !== 'string' ||
    typeof body.last_name !== 'string' ||
    body.status !== 'ACTIVE' ||
    !isNonEmptyString(body.language) ||
    !isNonEmptyString(body.timezone) ||
    !(body.last_login_at === null || isTimestamp(body.last_login_at)) ||
    !isTimestamp(body.created_at)
  ) {
    return null;
  }

  return {
    id: body.id,
    email: body.email,
    first_name: body.first_name,
    last_name: body.last_name,
    status: body.status,
    language: body.language,
    timezone: body.timezone,
    last_login_at: body.last_login_at,
    created_at: body.created_at,
  };
}

async function requestCurrentUser(): Promise<CurrentUserResult> {
  // A session that ends while `/me` is in flight (e.g. another request was rejected and cleared
  // the token) must not be restored by this response.
  const sessionVersion = getSessionVersion();
  let response: Response;

  try {
    response = await authenticatedFetch(CURRENT_USER_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      // `authenticatedFetch` has already cleared the token and redirected to login.
      return { ok: false, error: 'unauthenticated' };
    }
    if (error instanceof SessionRefreshError) {
      return { ok: false, error: error.reason };
    }
    return { ok: false, error: 'network' };
  }

  if (response.status !== 200) {
    return { ok: false, error: 'server' };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { ok: false, error: 'invalid_response' };
  }

  if (getSessionVersion() !== sessionVersion || !getAccessToken()) {
    return { ok: false, error: 'unauthenticated' };
  }

  const user = parseCurrentUser(body);

  return user ? { ok: true, user } : { ok: false, error: 'invalid_response' };
}

let currentUserInFlight: { sessionVersion: number; result: Promise<CurrentUserResult> } | null =
  null;

/**
 * Loads the authenticated user from `GET /api/users/me` through `authenticatedFetch`, which
 * restores a missing token, renews an expired one and retries the request at most once.
 *
 * Concurrent callers (several guards, React Strict Mode) share one in-flight request, but only
 * within the same session: after a logout or a new login a fresh request is started, so a
 * pending response of a previous session is never handed to the new one.
 */
export function fetchCurrentUser(): Promise<CurrentUserResult> {
  const sessionVersion = getSessionVersion();

  if (currentUserInFlight?.sessionVersion !== sessionVersion) {
    const inFlight = {
      sessionVersion,
      result: requestCurrentUser().finally(() => {
        if (currentUserInFlight === inFlight) {
          currentUserInFlight = null;
        }
      }),
    };
    currentUserInFlight = inFlight;
  }

  return currentUserInFlight.result;
}
