import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGOUT_ENDPOINT, requestLogout } from './logout';

const API = 'http://localhost:8000';

describe('requestLogout', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts to the logout endpoint with the refresh cookie and without an access token', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await requestLogout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}${LOGOUT_ENDPOINT}`);
    expect(LOGOUT_ENDPOINT).toBe('/api/auth/logout');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('treats 204 No Content as a confirmed logout without parsing a body', async () => {
    const response = new Response(null, { status: 204 });
    const jsonSpy = vi.spyOn(response, 'json');
    const textSpy = vi.spyOn(response, 'text');
    fetchMock.mockResolvedValue(response);

    await expect(requestLogout()).resolves.toBe('ok');

    expect(jsonSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('maps 401 to an already ended session', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INVALID_REFRESH_TOKEN' } }), { status: 401 }),
    );

    await expect(requestLogout()).resolves.toBe('unauthenticated');
  });

  it.each([500, 502, 503, 200, 403, 429])(
    'maps status %i to an unknown server outcome',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('{}', { status }));

      await expect(requestLogout()).resolves.toBe('server');
    },
  );

  it('maps a failed request to a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(requestLogout()).resolves.toBe('network');
  });

  it('reports a missing API configuration as a server error without a request', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    await expect(requestLogout()).resolves.toBe('server');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
