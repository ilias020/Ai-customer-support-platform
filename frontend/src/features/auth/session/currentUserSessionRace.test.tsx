import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchCurrentUser } from '../api/currentUser';
import { LoginForm } from '../components/LoginForm';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { clearAccessToken, getAccessToken, setAccessToken } from './accessToken';
import { useCurrentUser } from './CurrentUserContext';
import { refreshSession } from './refreshSession';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const API = 'http://localhost:8000';
const LOGIN_URL = `${API}/api/auth/login`;
const REFRESH_URL = `${API}/api/auth/refresh`;
const ME_URL = `${API}/api/users/me`;

const userResponse = (id: string, email: string) => ({
  id,
  email,
  first_name: email.split('@')[0],
  last_name: 'Test',
  status: 'ACTIVE',
  language: 'en',
  timezone: 'UTC',
  last_login_at: null,
  created_at: '2026-08-20T09:30:00Z',
});
const USER_X = userResponse('11111111-1111-4111-8111-111111111111', 'x@example.com');
const USER_Y = userResponse('22222222-2222-4222-8222-222222222222', 'y@example.com');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Email() {
  return <p>Ingelogd als {useCurrentUser().email}</p>;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('current user across sessions (race conditions)', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const pendingMe = new Map<string, ReturnType<typeof deferred<Response>>>();

  const meCallsWith = (token: string) =>
    fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === ME_URL && new Headers(init?.headers).get('Authorization') === `Bearer ${token}`,
    );

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === LOGIN_URL) {
        return Promise.resolve(
          jsonResponse(200, { access_token: 'token-y', token_type: 'bearer', expires_in: 900 }),
        );
      }
      if (url === ME_URL) {
        const token = new Headers(init?.headers).get('Authorization') ?? '';
        const pending = deferred<Response>();
        pendingMe.set(token, pending);
        return pending.promise;
      }
      if (url === REFRESH_URL) {
        return Promise.resolve(
          jsonResponse(200, {
            access_token: 'token-x-renewed',
            token_type: 'bearer',
            expires_in: 900,
          }),
        );
      }
      throw new Error(`Unexpected request to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    pendingMe.clear();
    fetchMock.mockReset();
    clearAccessToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('never shows the previous user after a new login while the old /me is still pending', async () => {
    // User X is on a protected page; its /me request is slow.
    setAccessToken('token-x');
    const first = render(
      <ProtectedRoute>
        <Email />
      </ProtectedRoute>,
    );
    await waitFor(() => expect(meCallsWith('token-x')).toHaveLength(1));

    // Client-side navigation to /login (no full page load) and a login as user Y.
    first.unmount();
    const user = userEvent.setup();
    const login = render(<LoginForm />);
    await user.type(screen.getByLabelText('E-mailadres'), 'y@example.com');
    await user.type(screen.getByLabelText('Wachtwoord'), 'Correct-Horse-1');
    await user.click(screen.getByRole('button', { name: 'Inloggen' }));
    await waitFor(() => expect(getAccessToken()).toBe('token-y'));
    login.unmount();

    // router.replace('/dashboard') mounts the protected layout again.
    render(
      <ProtectedRoute>
        <Email />
      </ProtectedRoute>,
    );

    // The old response for user X arrives first.
    pendingMe.get('Bearer token-x')?.resolve(jsonResponse(200, USER_X));
    await settle();
    expect(screen.queryByText(/x@example.com/)).not.toBeInTheDocument();

    // The new session is confirmed by its own /me request.
    await waitFor(() => expect(meCallsWith('token-y')).toHaveLength(1));
    pendingMe.get('Bearer token-y')?.resolve(jsonResponse(200, USER_Y));

    expect(await screen.findByText('Ingelogd als y@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/x@example.com/)).not.toBeInTheDocument();
  });

  it('keeps a /me result when the token is renewed within the same session meanwhile', async () => {
    setAccessToken('token-x');
    const result = fetchCurrentUser();
    await waitFor(() => expect(meCallsWith('token-x')).toHaveLength(1));

    // Another request renews the access token of the same session (refresh, not a new login).
    await refreshSession();
    expect(getAccessToken()).toBe('token-x-renewed');
    pendingMe.get('Bearer token-x')?.resolve(jsonResponse(200, USER_X));

    expect(await result).toEqual({ ok: true, user: USER_X });
  });
});

describe('refresh and login with a shared refresh cookie (race conditions)', () => {
  const fetchMock = vi.fn<typeof fetch>();
  /** Simulates the browser cookie jar holding the HttpOnly refresh cookie. */
  let refreshCookie: string;
  let pendingRefresh: ReturnType<typeof deferred<void>> | null;
  let pendingLogin: ReturnType<typeof deferred<void>> | null;
  const requestOrder: string[] = [];

  function installSerialWebLocks() {
    // Minimal Web Locks API: requests for the same lock run strictly one after another.
    let tail: Promise<unknown> = Promise.resolve();
    const locks = {
      request: (_name: string, callback: () => Promise<unknown>) => {
        const run = tail.then(() => callback());
        tail = run.catch(() => undefined);
        return run;
      },
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
  }

  beforeEach(() => {
    refreshCookie = 'cookie-x';
    pendingRefresh = null;
    pendingLogin = null;
    requestOrder.length = 0;
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    installSerialWebLocks();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === REFRESH_URL) {
        // The browser sends the cookie that is current when the request starts.
        const sentCookie = refreshCookie;
        requestOrder.push(`refresh:${sentCookie}`);
        await pendingRefresh?.promise;
        // The backend rotates the session of the sent cookie and sets the new cookie.
        refreshCookie = `${sentCookie}-rotated`;
        return jsonResponse(200, {
          access_token: `token-of-${refreshCookie}`,
          token_type: 'bearer',
          expires_in: 900,
        });
      }
      if (url === LOGIN_URL) {
        requestOrder.push('login');
        await pendingLogin?.promise;
        refreshCookie = 'cookie-y';
        return jsonResponse(200, {
          access_token: 'token-y',
          token_type: 'bearer',
          expires_in: 900,
        });
      }
      throw new Error(`Unexpected request to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    clearAccessToken();
    delete (navigator as { locks?: unknown }).locks;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function submitLoginAsY() {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText('E-mailadres'), 'y@example.com');
    await user.type(screen.getByLabelText('Wachtwoord'), 'Correct-Horse-1');
    await user.click(screen.getByRole('button', { name: 'Inloggen' }));
  }

  it('a slow refresh of user X cannot overwrite the cookie and token of a new login as Y', async () => {
    pendingRefresh = deferred<void>();
    const refresh = refreshSession();
    await waitFor(() => expect(requestOrder).toEqual(['refresh:cookie-x']));

    await submitLoginAsY();
    await settle();
    // The login waits until the running refresh has completed.
    expect(requestOrder).toEqual(['refresh:cookie-x']);

    pendingRefresh.resolve();
    await refresh;
    await waitFor(() => expect(getAccessToken()).toBe('token-y'));
    await settle();

    expect(requestOrder).toEqual(['refresh:cookie-x', 'login']);
    expect(refreshCookie).toBe('cookie-y');
    expect(getAccessToken()).toBe('token-y');
  });

  it('a refresh that starts during a login uses the cookie of the new session', async () => {
    pendingLogin = deferred<void>();
    await submitLoginAsY();
    await waitFor(() => expect(requestOrder).toEqual(['login']));

    const refresh = refreshSession();
    await settle();
    expect(requestOrder).toEqual(['login']);

    pendingLogin.resolve();

    expect(await refresh).toEqual({ ok: true, accessToken: 'token-of-cookie-y-rotated' });
    expect(requestOrder).toEqual(['login', 'refresh:cookie-y']);
    expect(refreshCookie).toBe('cookie-y-rotated');
    expect(getAccessToken()).toBe('token-of-cookie-y-rotated');
  });
});
