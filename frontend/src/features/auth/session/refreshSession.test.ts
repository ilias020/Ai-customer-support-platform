import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, getAccessToken, setAccessToken } from './accessToken';
import { REFRESH_LOCK_NAME, refreshSession } from './refreshSession';

function tokenResponse(token: string): Response {
  return new Response(
    JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 900 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('refreshSession', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    clearAccessToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('stores the renewed access token in memory only', async () => {
    fetchMock.mockResolvedValue(tokenResponse('renewed-token'));

    await refreshSession();

    expect(getAccessToken()).toBe('renewed-token');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('renewed-token');
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    let resolveRefresh: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const results = Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    resolveRefresh(tokenResponse('shared-token'));

    await expect(results).resolves.toEqual([
      { ok: true, accessToken: 'shared-token' },
      { ok: true, accessToken: 'shared-token' },
      { ok: true, accessToken: 'shared-token' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts a new refresh after the previous one has finished', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('first'));
    fetchMock.mockResolvedValueOnce(tokenResponse('second'));

    await refreshSession();
    await refreshSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBe('second');
  });

  it('clears the access token only when the backend rejects the session', async () => {
    setAccessToken('old-token');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await refreshSession();
    expect(getAccessToken()).toBe('old-token');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await refreshSession();
    expect(getAccessToken()).toBe('old-token');

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await refreshSession();
    expect(getAccessToken()).toBeNull();
  });

  it('serializes refreshes across tabs with the Web Locks API when available', async () => {
    const lockRequests: string[] = [];
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        request: vi.fn(async (name: string, callback: () => Promise<unknown>) => {
          lockRequests.push(name);
          return callback();
        }),
      },
    });
    fetchMock.mockResolvedValue(tokenResponse('locked-token'));

    await expect(refreshSession()).resolves.toEqual({ ok: true, accessToken: 'locked-token' });

    expect(lockRequests).toEqual([REFRESH_LOCK_NAME]);
    expect(getAccessToken()).toBe('locked-token');
  });
});
