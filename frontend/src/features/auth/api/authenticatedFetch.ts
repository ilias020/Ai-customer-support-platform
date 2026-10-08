import { getApiBaseUrl } from '../../../lib/api/config';
import { redirectToLogin } from '../navigation';
import { clearAccessToken, getAccessToken } from '../session/accessToken';
import { refreshSession } from '../session/refreshSession';

/** The session could not be renewed; the user has been sent to the login page. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('The session is no longer valid.');
    this.name = 'UnauthenticatedError';
  }
}

/** Renewing the session failed because of a server or network error; the session is kept. */
export class SessionRefreshError extends Error {
  readonly reason: 'server' | 'network';

  constructor(reason: 'server' | 'network') {
    super('The session could not be renewed.');
    this.name = 'SessionRefreshError';
    this.reason = reason;
  }
}

function endSession(): never {
  clearAccessToken();
  redirectToLogin();
  throw new UnauthenticatedError();
}

async function renewAccessToken(): Promise<string> {
  const result = await refreshSession();

  if (result.ok) {
    return result.accessToken;
  }

  if (result.error === 'unauthenticated') {
    endSession();
  }

  throw new SessionRefreshError(result.error);
}

function send(path: string, init: RequestInit, accessToken: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });
}

/**
 * Central fetch for API requests that require authentication.
 *
 * - Sends the in-memory access token as `Authorization: Bearer <token>`.
 * - On `401 Unauthorized` it renews the session once (shared with concurrent requests) and
 *   retries the original request exactly once with the new access token.
 * - A rejected refresh or a `401` on the retried request ends the session and redirects to login.
 * - Server and network errors during the refresh throw a `SessionRefreshError`; nothing is retried.
 *
 * `init.body` is sent again on the retry, so it must be replayable (e.g. a string or FormData).
 * Public endpoints such as login and refresh do not use this function.
 */
export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = getAccessToken() ?? (await renewAccessToken());
  const response = await send(path, init, accessToken);

  if (response.status !== 401) {
    return response;
  }

  // Another request may already have renewed the token while this one was in flight.
  const currentToken = getAccessToken();
  const renewedToken =
    currentToken && currentToken !== accessToken ? currentToken : await renewAccessToken();

  const retriedResponse = await send(path, init, renewedToken);

  if (retriedResponse.status === 401) {
    endSession();
  }

  return retriedResponse;
}
