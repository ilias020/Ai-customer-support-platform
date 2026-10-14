import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register, type RegisterPayload } from './register';

const PAYLOAD: RegisterPayload = {
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  password: ' Correct-Horse-9 ',
  workspace_name: 'Example Company',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const tokenBody = { access_token: 'new-access-token', token_type: 'bearer', expires_in: 900 };

describe('register', () => {
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

  it('posts exactly the five contract fields with credentials for the refresh cookie', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, tokenBody));

    await register({ ...PAYLOAD, password_confirmation: 'x' } as RegisterPayload);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/auth/register');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(PAYLOAD);
  });

  it('returns the access token on 201 Created', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, tokenBody));

    expect(await register(PAYLOAD)).toEqual({
      ok: true,
      accessToken: 'new-access-token',
      expiresIn: 900,
    });
  });

  it('does not treat 200 as a successful registration', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody));

    expect(await register(PAYLOAD)).toEqual({ ok: false, error: 'server' });
  });

  it.each([
    [409, 'email_exists'],
    [429, 'rate_limited'],
    [500, 'server'],
    [503, 'server'],
  ])('maps status %i to %s', async (status, error) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { error: { code: 'X', message: 'x' } }));

    expect(await register(PAYLOAD)).toEqual({ ok: false, error });
  });

  it('maps 422 and returns the invalid contract fields', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid data.',
          details: [
            { field: 'password', message: 'Password must contain a digit (0-9).' },
            { field: 'email', message: 'x' },
            { field: 'unknown', message: 'x' },
          ],
        },
        request_id: 'req_1',
      }),
    );

    expect(await register(PAYLOAD)).toEqual({
      ok: false,
      error: 'validation',
      invalidFields: ['password', 'email'],
    });
  });

  it('handles a 422 without details', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 422 }));

    expect(await register(PAYLOAD)).toEqual({ ok: false, error: 'validation', invalidFields: [] });
  });

  it('maps a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await register(PAYLOAD)).toEqual({ ok: false, error: 'network' });
  });

  it('rejects an invalid success body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { access_token: '', token_type: 'bearer' }));

    expect(await register(PAYLOAD)).toEqual({ ok: false, error: 'server' });
  });
});
