import { getApiBaseUrl } from '../../../lib/api/config';

export const LOGOUT_ENDPOINT = '/api/auth/logout';

/**
 * - `ok`:              `204 No Content`; the backend revoked the current session.
 * - `unauthenticated`: `401`; the session was missing, invalid, expired or already revoked.
 * - `server`/`network`: unknown outcome; the session may still be active.
 */
export type LogoutOutcome = 'ok' | 'unauthenticated' | 'server' | 'network';

/**
 * Calls `POST /api/auth/logout` once (Issue #14).
 *
 * The current session is identified by the HttpOnly `nimbus_refresh_token` cookie, which the
 * browser sends with `credentials: 'include'`. No access token is sent: the backend does not
 * need one. A `204` has no body and is never parsed; the backend removes the cookie on `204` and
 * `401`.
 */
export async function requestLogout(): Promise<LogoutOutcome> {
  let url: string;

  try {
    url = `${getApiBaseUrl()}${LOGOUT_ENDPOINT}`;
  } catch {
    return 'server';
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return 'network';
  }

  if (response.status === 204) {
    return 'ok';
  }

  if (response.status === 401) {
    return 'unauthenticated';
  }

  return 'server';
}
