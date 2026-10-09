import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirectToLogin } from '../navigation';
import { clearAccessToken, getAccessToken, setAccessToken } from '../session/accessToken';
import {
  authenticatedFetch,
  SessionRefreshError,
  UnauthenticatedError,
} from './authenticatedFetch';

vi.mock('../navigation', () => ({
  LOGIN_ROUTE: '/login',
  getCurrentPath: () => '/dashboard?tab=open',
  redirectToLogin: vi.fn(),
}));

const API = 'http://localhost:8000';
const REFRESH_URL = `${API}/api/auth/refresh`;
const PROTECTED_PATH = '/api/protected-resource';
const PROTECTED_URL = `${API}${PROTECTED_PATH}`;

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

function tokenResponse(token: string): Response {
  return new Response(
    JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 900 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'x' }, request_id: 'r' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

function ok(body: unknown = { data: 'ok' }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Protected endpoint that only accepts the given access token. */
function protectedEndpointAccepting(validToken: string): Handler {
  return (init) =>
    new Headers(init?.headers).get('Authorization') === `Bearer ${validToken}`
      ? ok()
      : unauthorized();
}

describe('authenticatedFetch', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let refreshHandler: Handler;
  let protectedHandler: Handler;

  const callsTo = (url: string) =>
    fetchMock.mock.calls.filter(([requestUrl]) => requestUrl === url);
  const authHeaders = () =>
    callsTo(PROTECTED_URL).map(([, init]) => new Headers(init?.headers).get('Authorization'));

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    vi.stubGlobal('fetch', fetchMock);
    refreshHandler = () => tokenResponse('renewed-token');
    protectedHandler = protectedEndpointAccepting('renewed-token');
    fetchMock.mockImplementation(async (input, init) => {
      if (input === REFRESH_URL) return refreshHandler(init);
      if (input === PROTECTED_URL) return protectedHandler(init);
      throw new Error(`Unexpected request to ${String(input)}`);
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.mocked(redirectToLogin).mockReset();
    clearAccessToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the access token and does not refresh when it is valid', async () => {
    setAccessToken('valid-token');
    protectedHandler = protectedEndpointAccepting('valid-token');

    const response = await authenticatedFetch(PROTECTED_PATH);

    expect(response.status).toBe(200);
    expect(authHeaders()).toEqual(['Bearer valid-token']);
    expect(callsTo(REFRESH_URL)).toHaveLength(0);
  });

  it('refreshes once after an expired access token and retries the original request', async () => {
    setAccessToken('expired-token');

    const response = await authenticatedFetch(PROTECTED_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: 'ok' });
    expect(callsTo(REFRESH_URL)).toHaveLength(1);
    expect(authHeaders()).toEqual(['Bearer expired-token', 'Bearer renewed-token']);
    const [, retryInit] = callsTo(PROTECTED_URL)[1];
    expect(retryInit?.method).toBe('POST');
    expect(retryInit?.body).toBe(JSON.stringify({ content: 'hello' }));
    expect(new Headers(retryInit?.headers).get('Content-Type')).toBe('application/json');
    expect(getAccessToken()).toBe('renewed-token');
    expect(redirectToLogin).not.toHaveBeenCalled();
  });

  it('includes the refresh cookie when renewing the session', async () => {
    setAccessToken('expired-token');

    await authenticatedFetch(PROTECTED_PATH);

    const [, refreshInit] = callsTo(REFRESH_URL)[0];
    expect(refreshInit?.method).toBe('POST');
    expect(refreshInit?.credentials).toBe('include');
  });

  it('renews the session first when no access token is in memory', async () => {
    const response = await authenticatedFetch(PROTECTED_PATH);

    expect(response.status).toBe(200);
    expect(callsTo(REFRESH_URL)).toHaveLength(1);
    expect(authHeaders()).toEqual(['Bearer renewed-token']);
  });

  it('ends the session and redirects to login when the refresh is rejected', async () => {
    setAccessToken('expired-token');
    refreshHandler = () => unauthorized();

    await expect(authenticatedFetch(PROTECTED_PATH)).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(getAccessToken()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(redirectToLogin).toHaveBeenCalledWith('/dashboard?tab=open');
    expect(callsTo(REFRESH_URL)).toHaveLength(1);
    expect(callsTo(PROTECTED_URL)).toHaveLength(1);
  });

  it('starts at most one refresh for concurrent requests with an expired token', async () => {
    setAccessToken('expired-token');
    let resolveRefresh: (response: Response) => void = () => {};
    refreshHandler = () =>
      new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });

    const requests = Promise.all([
      authenticatedFetch(PROTECTED_PATH),
      authenticatedFetch(PROTECTED_PATH),
      authenticatedFetch(PROTECTED_PATH),
    ]);
    await vi.waitFor(() => expect(callsTo(REFRESH_URL)).toHaveLength(1));
    resolveRefresh(tokenResponse('renewed-token'));

    const responses = await requests;

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(callsTo(REFRESH_URL)).toHaveLength(1);
    expect(authHeaders().filter((header) => header === 'Bearer renewed-token')).toHaveLength(3);
  });

  it('reuses a token renewed by another request instead of refreshing again', async () => {
    setAccessToken('expired-token');
    let resolveSlowRequest: (response: Response) => void = () => {};
    let protectedCalls = 0;
    protectedHandler = (init) => {
      protectedCalls += 1;
      if (protectedCalls === 1) {
        // First request is slow and still uses the expired token.
        return new Promise<Response>((resolve) => {
          resolveSlowRequest = resolve;
        });
      }
      return protectedEndpointAccepting('renewed-token')(init);
    };

    const slowRequest = authenticatedFetch(PROTECTED_PATH);
    await vi.waitFor(() => expect(protectedCalls).toBe(1));
    await authenticatedFetch(PROTECTED_PATH);
    resolveSlowRequest(unauthorized());

    expect((await slowRequest).status).toBe(200);
    expect(callsTo(REFRESH_URL)).toHaveLength(1);
  });

  it('does not refresh again when the retried request is still unauthorized', async () => {
    setAccessToken('expired-token');
    protectedHandler = () => unauthorized();

    await expect(authenticatedFetch(PROTECTED_PATH)).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(callsTo(REFRESH_URL)).toHaveLength(1);
    expect(callsTo(PROTECTED_URL)).toHaveLength(2);
    expect(getAccessToken()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a server error', () => new Response(null, { status: 500 }), 'server'],
    [
      'a network error',
      () => {
        throw new TypeError('Failed to fetch');
      },
      'network',
    ],
  ])('handles %s during refresh without retrying or logging out', async (_, handler, reason) => {
    setAccessToken('expired-token');
    refreshHandler = handler;

    const error = await authenticatedFetch(PROTECTED_PATH).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SessionRefreshError);
    expect((error as SessionRefreshError).reason).toBe(reason);
    expect(callsTo(REFRESH_URL)).toHaveLength(1);
    expect(callsTo(PROTECTED_URL)).toHaveLength(1);
    expect(getAccessToken()).toBe('expired-token');
    expect(redirectToLogin).not.toHaveBeenCalled();
  });

  it('allows a new refresh attempt on a later request after a failed refresh', async () => {
    setAccessToken('expired-token');
    refreshHandler = () => new Response(null, { status: 500 });
    await expect(authenticatedFetch(PROTECTED_PATH)).rejects.toBeInstanceOf(SessionRefreshError);

    refreshHandler = () => tokenResponse('renewed-token');
    const response = await authenticatedFetch(PROTECTED_PATH);

    expect(response.status).toBe(200);
    expect(callsTo(REFRESH_URL)).toHaveLength(2);
  });

  it('returns non-401 errors of the protected request unchanged', async () => {
    setAccessToken('valid-token');
    protectedHandler = () => new Response(null, { status: 403 });

    const response = await authenticatedFetch(PROTECTED_PATH);

    expect(response.status).toBe(403);
    expect(callsTo(REFRESH_URL)).toHaveLength(0);
  });

  it('never stores tokens in browser storage or logs them', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setAccessToken('expired-token');

    await authenticatedFetch(PROTECTED_PATH);

    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('renewed-token');
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
