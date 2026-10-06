import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { login } from './login';

const credentials = { email: 'user@example.com', password: 'Correct-Horse-1' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const validTokenBody = {
  access_token: 'access-token-value',
  token_type: 'bearer',
  expires_in: 900,
};

describe('login', () => {
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

  it('posts the credentials as JSON with credentials included', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, validTokenBody));

    await login(credentials);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/auth/login');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual(credentials);
  });

  it('does not duplicate slashes when the base URL ends with a slash', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000/');
    fetchMock.mockResolvedValue(jsonResponse(200, validTokenBody));

    await login(credentials);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/auth/login');
  });

  it('returns the access token for a valid 200 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, validTokenBody));

    await expect(login(credentials)).resolves.toEqual({
      ok: true,
      accessToken: 'access-token-value',
      expiresIn: 900,
    });
  });

  it.each([
    [{ token_type: 'bearer', expires_in: 900 }],
    [{ access_token: '', token_type: 'bearer', expires_in: 900 }],
    [{ access_token: 'token', token_type: 'mac', expires_in: 900 }],
    [{ access_token: 'token', token_type: 'bearer' }],
    [{ access_token: 'token', token_type: 'bearer', expires_in: '900' }],
    [{ access_token: 'token', token_type: 'bearer', expires_in: 0 }],
    [null],
  ])('rejects an invalid 200 response body %j', async (body) => {
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    await expect(login(credentials)).resolves.toEqual({ ok: false, error: 'server' });
  });

  it('rejects a 200 response that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

    await expect(login(credentials)).resolves.toEqual({ ok: false, error: 'server' });
  });

  it.each([
    [401, 'invalid_credentials'],
    [422, 'validation'],
    [429, 'rate_limited'],
    [500, 'server'],
    [503, 'server'],
    [404, 'server'],
  ])('maps HTTP %i to %s', async (status, error) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: { code: 'X', message: 'Y' } }));

    await expect(login(credentials)).resolves.toEqual({ ok: false, error });
  });

  it('maps a failed request to a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(login(credentials)).resolves.toEqual({ ok: false, error: 'network' });
  });

  it('returns a server error without calling fetch when the API URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    await expect(login(credentials)).resolves.toEqual({ ok: false, error: 'server' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
