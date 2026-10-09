import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, setAccessToken, startSession } from '../session/accessToken';
import { CURRENT_USER_ENDPOINT, fetchCurrentUser, parseCurrentUser } from './currentUser';

vi.mock('../navigation', () => ({
  LOGIN_ROUTE: '/login',
  getCurrentPath: () => '/dashboard',
  redirectToLogin: vi.fn(),
}));

const ME_URL = `http://localhost:8000${CURRENT_USER_ENDPOINT}`;

const USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'john@example.com',
  first_name: 'John',
  last_name: 'Doe',
  status: 'ACTIVE',
  language: 'en',
  timezone: 'UTC',
  last_login_at: '2026-10-09T08:12:00Z',
  created_at: '2026-08-20T09:30:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseCurrentUser', () => {
  it('accepts the nine contract fields', () => {
    expect(parseCurrentUser(USER)).toEqual(USER);
  });

  it('accepts last_login_at null', () => {
    expect(parseCurrentUser({ ...USER, last_login_at: null })).toEqual({
      ...USER,
      last_login_at: null,
    });
  });

  it('keeps only the contract fields', () => {
    const parsed = parseCurrentUser({ ...USER, password_hash: 'x', role: 'ADMIN' });

    expect(parsed).toEqual(USER);
    expect(Object.keys(parsed ?? {})).toHaveLength(9);
  });

  it.each([
    ['null', null],
    ['an array', [USER]],
    ['a data wrapper', { data: USER }],
    ['a string', 'john@example.com'],
  ])('rejects %s', (_label, value) => {
    expect(parseCurrentUser(value)).toBeNull();
  });

  it.each([
    'id',
    'email',
    'first_name',
    'last_name',
    'status',
    'language',
    'timezone',
    'last_login_at',
    'created_at',
  ])('rejects a response without %s', (field) => {
    const body: Record<string, unknown> = { ...USER };
    delete body[field];

    expect(parseCurrentUser(body)).toBeNull();
  });

  it.each([
    ['id', ''],
    ['id', 123],
    ['email', ''],
    ['first_name', null],
    ['status', 'INACTIVE'],
    ['language', 1],
    ['timezone', ''],
    ['last_login_at', 'not-a-date'],
    ['last_login_at', 0],
    ['created_at', null],
    ['created_at', 'gisteren'],
  ])('rejects %s = %j', (field, value) => {
    expect(parseCurrentUser({ ...USER, [field]: value })).toBeNull();
  });
});

describe('fetchCurrentUser', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('access-token');
  });

  afterEach(() => {
    fetchMock.mockReset();
    clearAccessToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('requests GET /api/users/me with the bearer token and returns the user', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, USER));

    const result = await fetchCurrentUser();

    expect(result).toEqual({ ok: true, user: USER });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ME_URL);
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('shares one request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, USER));

    const results = await Promise.all([fetchCurrentUser(), fetchCurrentUser(), fetchCurrentUser()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('does not share a pending request with a new session', async () => {
    let respondOld!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (respondOld = resolve)))
      .mockResolvedValueOnce(jsonResponse(200, { ...USER, email: 'new@example.com' }));

    const oldSession = fetchCurrentUser();
    startSession('token-of-new-login');
    const newSession = fetchCurrentUser();
    respondOld(jsonResponse(200, USER));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe(
      'Bearer token-of-new-login',
    );
    expect(await oldSession).toEqual({ ok: false, error: 'unauthenticated' });
    expect(await newSession).toEqual({
      ok: true,
      user: { ...USER, email: 'new@example.com' },
    });
  });

  it('starts a new request after the previous one finished', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, USER));

    await fetchCurrentUser();
    await fetchCurrentUser();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [500, 'server'],
    [403, 'server'],
    [404, 'server'],
  ])('maps status %i to %s', async (status, error) => {
    fetchMock.mockResolvedValue(jsonResponse(status, {}));

    expect(await fetchCurrentUser()).toEqual({ ok: false, error });
  });

  it('maps a network error to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await fetchCurrentUser()).toEqual({ ok: false, error: 'network' });
  });

  it('rejects a non-JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));

    expect(await fetchCurrentUser()).toEqual({ ok: false, error: 'invalid_response' });
  });

  it('rejects an unexpected response format', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: USER }));

    expect(await fetchCurrentUser()).toEqual({ ok: false, error: 'invalid_response' });
  });
});
