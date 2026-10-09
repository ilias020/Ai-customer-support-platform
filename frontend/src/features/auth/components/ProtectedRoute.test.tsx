import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_GUARD_MESSAGES } from '../messages';
import { clearAccessToken, getAccessToken, setAccessToken } from '../session/accessToken';
import { useCurrentUser } from '../session/CurrentUserContext';
import { ProtectedRoute } from './ProtectedRoute';

const API = 'http://localhost:8000';
const REFRESH_URL = `${API}/api/auth/refresh`;
const ME_URL = `${API}/api/users/me`;
const PROTECTED_TEXT = 'Geheime dashboardinhoud';

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

const errorBody = (code: string) => ({ error: { code, message: 'x' }, request_id: 'r' });
const refreshSuccess =
  (token = 'renewed-access-token') =>
  () =>
    jsonResponse(200, { access_token: token, token_type: 'bearer', expires_in: 900 });
const unauthorized =
  (code = 'AUTHENTICATION_REQUIRED') =>
  () =>
    jsonResponse(401, errorBody(code));
const serverError = () => () => jsonResponse(500, errorBody('INTERNAL_SERVER_ERROR'));
const networkError = () => () => Promise.reject(new TypeError('Failed to fetch'));
const meSuccess =
  (user: unknown = USER) =>
  () =>
    jsonResponse(200, user);

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Protected() {
  return <h1>{PROTECTED_TEXT}</h1>;
}

function UserName() {
  const user = useCurrentUser();
  return (
    <p>
      Ingelogd als {user.first_name} {user.last_name} ({user.email})
    </p>
  );
}

const guarded = (children = <Protected />) => <ProtectedRoute>{children}</ProtectedRoute>;

/** Lets pending promises and React updates settle, to prove nothing else happens afterwards. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('ProtectedRoute with current user (Issues #18 and #20)', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const replaceMock = vi.fn();
  let refreshHandlers: Handler[];
  let meHandlers: Handler[];

  const calls = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url);
  const bearerOfMeCalls = () =>
    calls(ME_URL).map(([, init]) => new Headers(init?.headers).get('Authorization'));

  function next(handlers: Handler[], url: string, init?: RequestInit) {
    const handler = handlers.length > 1 ? handlers.shift() : handlers[0];
    if (!handler) {
      throw new Error(`Unexpected request to ${url}`);
    }
    return Promise.resolve(handler(init));
  }

  beforeEach(() => {
    refreshHandlers = [];
    meHandlers = [];
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === REFRESH_URL) return next(refreshHandlers, url, init);
      if (url === ME_URL) return next(meHandlers, url, init);
      throw new Error(`Unexpected request to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    // Simulates a direct navigation or browser refresh on /dashboard?tab=open.
    vi.stubGlobal('location', {
      pathname: '/dashboard',
      search: '?tab=open',
      hash: '',
      replace: replaceMock,
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    replaceMock.mockReset();
    clearAccessToken();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('after login (access token in memory)', () => {
    it('confirms the user via /me without refreshing and shows the content', async () => {
      setAccessToken('login-access-token');
      meHandlers.push(meSuccess());

      render(guarded());

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(calls(REFRESH_URL)).toHaveLength(0);
      expect(calls(ME_URL)).toHaveLength(1);
      expect(bearerOfMeCalls()).toEqual(['Bearer login-access-token']);
    });

    it('makes the confirmed user available to protected components', async () => {
      setAccessToken('login-access-token');
      meHandlers.push(meSuccess());

      render(
        guarded(
          <>
            <Protected />
            <UserName />
          </>,
        ),
      );

      expect(
        await screen.findByText('Ingelogd als John Doe (john@example.com)'),
      ).toBeInTheDocument();
    });

    it('does not request /me again on repeated renders', async () => {
      setAccessToken('login-access-token');
      meHandlers.push(meSuccess());
      const { rerender } = render(guarded());
      await screen.findByText(PROTECTED_TEXT);

      for (let i = 0; i < 5; i += 1) {
        rerender(guarded());
      }
      await settle();

      expect(calls(ME_URL)).toHaveLength(1);
      expect(calls(REFRESH_URL)).toHaveLength(0);
    });

    it('renews an expired access token once and retries /me once', async () => {
      setAccessToken('expired-access-token');
      meHandlers.push(unauthorized('ACCESS_TOKEN_EXPIRED'), meSuccess());
      refreshHandlers.push(refreshSuccess('renewed-access-token'));

      render(guarded());

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(calls(REFRESH_URL)).toHaveLength(1);
      expect(bearerOfMeCalls()).toEqual([
        'Bearer expired-access-token',
        'Bearer renewed-access-token',
      ]);
      expect(getAccessToken()).toBe('renewed-access-token');
    });

    it('does not grant access on a token in memory alone when the backend rejects the session', async () => {
      setAccessToken('token-of-deactivated-user');
      meHandlers.push(unauthorized());
      refreshHandlers.push(unauthorized('INVALID_REFRESH_TOKEN'));

      render(guarded());

      await waitFor(() =>
        expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fdashboard%3Ftab%3Dopen'),
      );
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(SESSION_GUARD_MESSAGES.redirecting);
      expect(getAccessToken()).toBeNull();
    });
  });

  describe('without an access token (direct navigation or browser refresh)', () => {
    it('hides protected content during the refresh and the /me request', async () => {
      const refresh = deferred<Response>();
      const me = deferred<Response>();
      refreshHandlers.push(() => refresh.promise);
      meHandlers.push(() => me.promise);

      render(guarded());

      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(SESSION_GUARD_MESSAGES.checking);

      refresh.resolve(refreshSuccess()());
      await waitFor(() => expect(calls(ME_URL)).toHaveLength(1));
      // The token is now in memory, but the user is not confirmed yet.
      expect(getAccessToken()).toBe('renewed-access-token');
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();

      me.resolve(meSuccess()());

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
    });

    it('restores the session via the refresh cookie and then loads the user', async () => {
      refreshHandlers.push(refreshSuccess());
      meHandlers.push(meSuccess());

      render(guarded(<UserName />));

      expect(await screen.findByText(/Ingelogd als John Doe/)).toBeInTheDocument();
      expect(calls(REFRESH_URL)).toHaveLength(1);
      expect(calls(REFRESH_URL)[0][1]).toEqual(
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
      expect(bearerOfMeCalls()).toEqual(['Bearer renewed-access-token']);
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('sends a single refresh and a single /me request in React Strict Mode', async () => {
      refreshHandlers.push(refreshSuccess());
      meHandlers.push(meSuccess());

      render(<StrictMode>{guarded()}</StrictMode>);

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      await settle();
      expect(calls(REFRESH_URL)).toHaveLength(1);
      expect(calls(ME_URL)).toHaveLength(1);
    });

    it('shares one refresh and one /me request between multiple guards', async () => {
      refreshHandlers.push(refreshSuccess());
      meHandlers.push(meSuccess());

      render(
        <>
          {guarded()}
          {guarded(<p>Tweede beveiligd onderdeel</p>)}
        </>,
      );

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(await screen.findByText('Tweede beveiligd onderdeel')).toBeInTheDocument();
      expect(calls(REFRESH_URL)).toHaveLength(1);
      expect(calls(ME_URL)).toHaveLength(1);
    });
  });

  describe('when the backend rejects the session (refresh 401)', () => {
    it('redirects once to login with the requested page and never calls /me', async () => {
      refreshHandlers.push(unauthorized('INVALID_REFRESH_TOKEN'));

      render(guarded());

      await waitFor(() =>
        expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fdashboard%3Ftab%3Dopen'),
      );
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(calls(ME_URL)).toHaveLength(0);
      expect(getAccessToken()).toBeNull();
    });

    it('does not loop: one refresh, one redirect, also in Strict Mode with re-renders', async () => {
      refreshHandlers.push(unauthorized('INVALID_REFRESH_TOKEN'));

      const { rerender } = render(<StrictMode>{guarded()}</StrictMode>);
      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      rerender(<StrictMode>{guarded()}</StrictMode>);
      await settle();

      expect(calls(REFRESH_URL)).toHaveLength(1);
      expect(replaceMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    });

    it('ends the session when /me stays 401 after a successful refresh', async () => {
      setAccessToken('stale-token');
      meHandlers.push(unauthorized(), unauthorized());
      refreshHandlers.push(refreshSuccess());

      render(guarded());

      await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
      expect(calls(REFRESH_URL)).toHaveLength(1);
      expect(calls(ME_URL)).toHaveLength(2);
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(getAccessToken()).toBeNull();
    });
  });

  describe.each([
    ['refresh server error (500)', () => refreshHandlers.push(serverError())],
    ['refresh network error', () => refreshHandlers.push(networkError())],
    [
      '/me server error (500)',
      () => {
        refreshHandlers.push(refreshSuccess());
        meHandlers.push(serverError());
      },
    ],
    [
      '/me network error',
      () => {
        refreshHandlers.push(refreshSuccess());
        meHandlers.push(networkError());
      },
    ],
    [
      'invalid /me response',
      () => {
        refreshHandlers.push(refreshSuccess());
        meHandlers.push(meSuccess({ data: USER }));
      },
    ],
  ])('on a %s', (_label, arrangeFailure) => {
    it('shows a controlled error without content, redirect or automatic retries', async () => {
      arrangeFailure();

      render(guarded());

      expect(await screen.findByRole('alert')).toHaveTextContent(SESSION_GUARD_MESSAGES.error);
      const requests = fetchMock.mock.calls.length;
      await settle();
      expect(fetchMock.mock.calls.length).toBe(requests);
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('lets the user retry explicitly and grants access when it succeeds', async () => {
      arrangeFailure();
      const user = userEvent.setup();

      render(guarded());
      await screen.findByRole('alert');
      refreshHandlers.splice(0, refreshHandlers.length, refreshSuccess());
      meHandlers.splice(0, meHandlers.length, meSuccess());
      await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('keeps the in-memory token on a /me server error (no automatic logout)', async () => {
    setAccessToken('valid-token');
    meHandlers.push(serverError());

    render(guarded());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(getAccessToken()).toBe('valid-token');
    expect(calls(REFRESH_URL)).toHaveLength(0);
  });

  it('ignores a delayed /me response after the session ended meanwhile', async () => {
    setAccessToken('valid-token');
    const me = deferred<Response>();
    meHandlers.push(() => me.promise);
    render(guarded());
    await waitFor(() => expect(calls(ME_URL)).toHaveLength(1));

    // E.g. another request was rejected by the backend and ended the session.
    clearAccessToken();
    me.resolve(meSuccess()());
    await settle();

    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(SESSION_GUARD_MESSAGES.redirecting);
  });

  it('ignores a delayed /me response after a new session started meanwhile', async () => {
    setAccessToken('first-token');
    const me = deferred<Response>();
    meHandlers.push(() => me.promise);
    render(guarded());
    await waitFor(() => expect(calls(ME_URL)).toHaveLength(1));

    clearAccessToken();
    setAccessToken('second-token');
    me.resolve(meSuccess()());
    await settle();

    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
  });

  it('does not grant access based on manipulated local user data', async () => {
    const fakeUser = JSON.stringify({ ...USER, email: 'attacker@example.com' });
    window.localStorage.setItem('user', fakeUser);
    window.localStorage.setItem('currentUser', fakeUser);
    window.sessionStorage.setItem('user', fakeUser);
    document.cookie = `user=${encodeURIComponent(fakeUser)}`;
    refreshHandlers.push(unauthorized('INVALID_REFRESH_TOKEN'));

    render(guarded(<UserName />));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/attacker@example.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ingelogd als/)).not.toBeInTheDocument();
    document.cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('does not store the user or token in browser storage', async () => {
    refreshHandlers.push(refreshSuccess());
    meHandlers.push(meSuccess());
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(guarded(<UserName />));
    await screen.findByText(/Ingelogd als/);

    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('john@example.com');
    setItem.mockRestore();
  });

  it('does not render protected content during server rendering', () => {
    setAccessToken('current-access-token');

    const html = renderToString(guarded());

    expect(html).not.toContain(PROTECTED_TEXT);
    expect(html).toContain(SESSION_GUARD_MESSAGES.checking);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
