import { getApiBaseUrl } from '../../../lib/api/config';
import { isTokenResponse } from './tokenResponse';

export const REFRESH_ENDPOINT = '/api/auth/refresh';

export type RefreshErrorKind = 'unauthenticated' | 'server' | 'network';

export type RefreshResult =
  { ok: true; accessToken: string } | { ok: false; error: RefreshErrorKind };

/**
 * Calls `POST /api/auth/refresh` once.
 *
 * The refresh token is never read or stored by the frontend: it is sent and rotated by the
 * browser through the HttpOnly `nimbus_refresh_token` cookie (`credentials: 'include'`).
 * This request itself never triggers another refresh.
 */
export async function requestTokenRefresh(): Promise<RefreshResult> {
  let url: string;

  try {
    url = `${getApiBaseUrl()}${REFRESH_ENDPOINT}`;
  } catch {
    return { ok: false, error: 'server' };
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { ok: false, error: 'network' };
  }

  if (response.status === 401) {
    return { ok: false, error: 'unauthenticated' };
  }

  if (response.status !== 200) {
    return { ok: false, error: 'server' };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { ok: false, error: 'server' };
  }

  if (!isTokenResponse(body)) {
    return { ok: false, error: 'server' };
  }

  return { ok: true, accessToken: body.access_token };
}
