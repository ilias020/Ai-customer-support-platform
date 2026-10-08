import { getApiBaseUrl } from '../../../lib/api/config';
import { isTokenResponse } from './tokenResponse';

export const LOGIN_ENDPOINT = '/api/auth/login';

export type LoginCredentials = {
  email: string;
  password: string;
};

export type LoginErrorKind =
  'invalid_credentials' | 'validation' | 'rate_limited' | 'server' | 'network';

export type LoginResult =
  { ok: true; accessToken: string; expiresIn: number } | { ok: false; error: LoginErrorKind };

function errorKindForStatus(status: number): LoginErrorKind {
  switch (status) {
    case 401:
      return 'invalid_credentials';
    case 422:
      return 'validation';
    case 429:
      return 'rate_limited';
    default:
      return 'server';
  }
}

/**
 * Sends the login request to the backend.
 *
 * `credentials: 'include'` is required so the browser stores the HttpOnly refresh-token
 * cookie set by the (cross-origin) backend response.
 */
export async function login(credentials: LoginCredentials): Promise<LoginResult> {
  let url: string;

  try {
    url = `${getApiBaseUrl()}${LOGIN_ENDPOINT}`;
  } catch {
    return { ok: false, error: 'server' };
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    });
  } catch {
    return { ok: false, error: 'network' };
  }

  if (response.status !== 200) {
    return { ok: false, error: errorKindForStatus(response.status) };
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

  return { ok: true, accessToken: body.access_token, expiresIn: body.expires_in };
}
