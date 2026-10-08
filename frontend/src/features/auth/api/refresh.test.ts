import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTokenRefresh } from './refresh';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestTokenRefresh', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts to the refresh endpoint with the refresh cookie included', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: 'new-token', token_type: 'bearer', expires_in: 900 }),
    );

    await expect(requestTokenRefresh()).resolves.toEqual({ ok: true, accessToken: 'new-token' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/auth/refresh');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it.each([
    [401, 'unauthenticated'],
    [429, 'server'],
    [500, 'server'],
    [503, 'server'],
  ])('maps HTTP %i to %s', async (status, error) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: { code: 'X', message: 'Y' } }));

    await expect(requestTokenRefresh()).resolves.toEqual({ ok: false, error });
  });

  it('maps a failed request to a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(requestTokenRefresh()).resolves.toEqual({ ok: false, error: 'network' });
  });

  it.each([[{ access_token: 'x', token_type: 'mac', expires_in: 900 }], [{}], ['not-json']])(
    'rejects an invalid 200 response %j',
    async (body) => {
      fetchMock.mockResolvedValue(
        typeof body === 'string' ? new Response(body, { status: 200 }) : jsonResponse(200, body),
      );

      await expect(requestTokenRefresh()).resolves.toEqual({ ok: false, error: 'server' });
    },
  );
});
