import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGOUT_NOTICE_STORAGE_KEY } from '../logoutNotice';
import { clearAccessToken, getAccessToken, getSessionVersion, startSession } from './accessToken';
import { logout } from './logout';
import { REFRESH_LOCK_NAME, refreshSession } from './refreshSession';
import {
  resetSessionChannelForTests,
  SESSION_CHANNEL_NAME,
  SESSION_ENDED_MESSAGE,
} from './sessionBroadcast';

const API = 'http://localhost:8000';
const LOGOUT_URL = `${API}/api/auth/logout`;
const REFRESH_URL = `${API}/api/auth/refresh`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const noContent = () => new Response(null, { status: 204 });
const unauthorized = () =>
  new Response(JSON.stringify({ error: { code: 'INVALID_REFRESH_TOKEN' } }), { status: 401 });
const tokenResponse = (token: string) =>
  new Response(JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 900 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/** FIFO Web Lock: a task only starts after the previous holder released the lock. */
function installLockManager() {
  const requested: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn((name: string, callback: () => Promise<unknown>) => {
    requested.push(name);
    const run = tail.then(() => callback());
    tail = run.catch(() => undefined);
    return run;
  });
  vi.stubGlobal('navigator', { locks: { request } });
  return { requested, request };
}

describe('logout (session)', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const replaceMock = vi.fn();
  let otherTab: BroadcastChannel;
  let otherTabMessages: unknown[];

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', {
      pathname: '/dashboard',
      search: '',
      hash: '',
      replace: replaceMock,
    });
    otherTabMessages = [];
    otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
    otherTab.onmessage = (event) => otherTabMessages.push(event.data);
    startSession('session-token');
  });

  afterEach(() => {
    otherTab.close();
    resetSessionChannelForTests();
    fetchMock.mockReset();
    replaceMock.mockReset();
    clearAccessToken();
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('ends the local session after 204 and navigates to the login page', async () => {
    const { requested } = installLockManager();
    fetchMock.mockResolvedValue(noContent());
    const versionBefore = getSessionVersion();

    await expect(logout()).resolves.toBe('ok');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(LOGOUT_URL);
    expect(requested).toEqual([REFRESH_LOCK_NAME]);
    expect(getAccessToken()).toBeNull();
    expect(getSessionVersion()).toBeGreaterThan(versionBefore);
    expect(window.sessionStorage.getItem(LOGOUT_NOTICE_STORAGE_KEY)).toBe('logged_out');
    expect(replaceMock).toHaveBeenCalledExactlyOnceWith('/login');
    await waitFor(() => expect(otherTabMessages).toEqual([SESSION_ENDED_MESSAGE]));
  });

  it('treats 401 as an already ended session: cleared locally, but no success notice', async () => {
    installLockManager();
    fetchMock.mockResolvedValue(unauthorized());

    await expect(logout()).resolves.toBe('unauthenticated');

    expect(getAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem(LOGOUT_NOTICE_STORAGE_KEY)).toBe('session_ended');
    expect(replaceMock).toHaveBeenCalledExactlyOnceWith('/login');
    await waitFor(() => expect(otherTabMessages).toEqual([SESSION_ENDED_MESSAGE]));
  });

  it.each([
    ['server', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['network', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('keeps the session when the outcome is unknown (%s)', async (expected, respond) => {
    installLockManager();
    fetchMock.mockImplementation(respond);
    const versionBefore = getSessionVersion();

    await expect(logout()).resolves.toBe(expected);

    expect(getAccessToken()).toBe('session-token');
    expect(getSessionVersion()).toBe(versionBefore);
    expect(window.sessionStorage.getItem(LOGOUT_NOTICE_STORAGE_KEY)).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(otherTabMessages).toEqual([]);
  });

  it('reports an unexpected Web Lock failure without sending a request or changing state', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: vi.fn().mockRejectedValue(new Error('lock failed')) },
    });

    await expect(logout()).resolves.toBe('unexpected');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('session-token');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('still completes the logout when the notice cannot be stored', async () => {
    installLockManager();
    fetchMock.mockResolvedValue(noContent());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    await expect(logout()).resolves.toBe('ok');

    expect(getAccessToken()).toBeNull();
    expect(replaceMock).toHaveBeenCalledExactlyOnceWith('/login');
    vi.mocked(Storage.prototype.setItem).mockRestore();
  });

  it('still completes the logout when BroadcastChannel is not available', async () => {
    installLockManager();
    resetSessionChannelForTests();
    vi.stubGlobal('BroadcastChannel', undefined);
    fetchMock.mockResolvedValue(noContent());

    await expect(logout()).resolves.toBe('ok');

    expect(getAccessToken()).toBeNull();
    expect(replaceMock).toHaveBeenCalledExactlyOnceWith('/login');
  });

  describe('together with token refreshes (shared Web Lock)', () => {
    it('waits for a running refresh and then logs out with the rotated cookie', async () => {
      installLockManager();
      const refreshResponse = deferred<Response>();
      fetchMock.mockImplementation((input) =>
        String(input) === REFRESH_URL ? refreshResponse.promise : Promise.resolve(noContent()),
      );

      const refreshing = refreshSession();
      const loggingOut = logout();
      await new Promise((resolve) => setTimeout(resolve, 20));

      // The logout request is not sent while the refresh holds the lock.
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([REFRESH_URL]);

      refreshResponse.resolve(tokenResponse('rotated-token'));
      await refreshing;
      await expect(loggingOut).resolves.toBe('ok');

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([REFRESH_URL, LOGOUT_URL]);
      // The token of the refresh does not survive the logout that followed it.
      expect(getAccessToken()).toBeNull();
    });

    it('a refresh queued behind the logout cannot restore the session', async () => {
      installLockManager();
      const logoutResponse = deferred<Response>();
      fetchMock.mockImplementation((input) =>
        // The backend revoked the session and removed the cookie: the refresh is rejected.
        String(input) === LOGOUT_URL ? logoutResponse.promise : Promise.resolve(unauthorized()),
      );

      const loggingOut = logout();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const refreshing = refreshSession();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([LOGOUT_URL]);

      logoutResponse.resolve(noContent());
      await expect(loggingOut).resolves.toBe('ok');
      await expect(refreshing).resolves.toEqual({ ok: false, error: 'unauthenticated' });

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([LOGOUT_URL, REFRESH_URL]);
      expect(getAccessToken()).toBeNull();
    });
  });
});
