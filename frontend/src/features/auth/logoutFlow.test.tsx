import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedLayout from '../../app/(protected)/layout';
import DashboardPage from '../../app/(protected)/dashboard/page';
import { fetchCurrentUser } from './api/currentUser';
import { LoginForm } from './components/LoginForm';
import { LogoutNotice, resetLogoutNoticeForTests } from './components/LogoutNotice';
import { ProtectedRoute } from './components/ProtectedRoute';
import { clearAccessToken, getAccessToken, startSession } from './session/accessToken';
import { useCurrentUser } from './session/CurrentUserContext';
import { logout } from './session/logout';
import {
  resetSessionChannelForTests,
  SESSION_CHANNEL_NAME,
  SESSION_ENDED_MESSAGE,
} from './session/sessionBroadcast';

const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

const API = 'http://localhost:8000';
const LOGIN_URL = `${API}/api/auth/login`;
const LOGOUT_URL = `${API}/api/auth/logout`;
const REFRESH_URL = `${API}/api/auth/refresh`;
const ME_URL = `${API}/api/users/me`;

const USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'john@example.com',
  first_name: 'John',
  last_name: 'Doe',
  status: 'ACTIVE',
  language: 'en',
  timezone: 'UTC',
  last_login_at: null,
  created_at: '2026-08-20T09:30:00Z',
};

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

/**
 * Simulated backend: one session that is active until it is logged out. After the logout the
 * refresh cookie is gone, so every refresh is rejected with 401.
 */
function createBackend() {
  let sessionActive = true;
  const handler = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === LOGOUT_URL) {
      if (!sessionActive) return jsonResponse(401, { error: { code: 'INVALID_REFRESH_TOKEN' } });
      sessionActive = false;
      return new Response(null, { status: 204 });
    }
    if (url === REFRESH_URL) {
      return sessionActive
        ? jsonResponse(200, {
            access_token: 'refreshed-token',
            token_type: 'bearer',
            expires_in: 900,
          })
        : jsonResponse(401, { error: { code: 'INVALID_REFRESH_TOKEN' } });
    }
    if (url === ME_URL) {
      const authorization = new Headers(init?.headers).get('Authorization');
      return authorization ? jsonResponse(200, USER) : jsonResponse(401, {});
    }
    if (url === LOGIN_URL) {
      sessionActive = true;
      return jsonResponse(200, {
        access_token: 'new-login-token',
        token_type: 'bearer',
        expires_in: 900,
      });
    }
    throw new Error(`Unexpected request to ${url}`);
  });
  return { handler, isActive: () => sessionActive };
}

describe('logout flow', () => {
  const locationReplace = vi.fn();
  let backend: ReturnType<typeof createBackend>;
  const calls = (url: string) => backend.handler.mock.calls.filter(([input]) => input === url);

  beforeEach(() => {
    backend = createBackend();
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    vi.stubGlobal('fetch', backend.handler);
    vi.stubGlobal('location', {
      pathname: '/dashboard',
      search: '',
      hash: '',
      replace: locationReplace,
    });
    startSession('session-token');
  });

  afterEach(() => {
    resetSessionChannelForTests();
    resetLogoutNoticeForTests();
    locationReplace.mockReset();
    routerReplace.mockReset();
    clearAccessToken();
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function renderDashboard() {
    const view = render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );
    await screen.findByRole('heading', { name: 'Dashboard' });
    return view;
  }

  it('logs out from the dashboard, ends the session and shows the snackbar once on /login', async () => {
    const user = userEvent.setup();
    const dashboard = await renderDashboard();

    // The logout action sits in the page header (banner).
    const header = screen.getByRole('banner');
    await user.click(within(header).getByRole('button', { name: 'Uitloggen' }));
    const dialog = screen.getByRole('dialog', { name: 'Uitloggen bij Nimbus?' });
    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

    await waitFor(() => expect(locationReplace).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(calls(LOGOUT_URL)).toHaveLength(1);
    expect(getAccessToken()).toBeNull();
    expect(backend.isActive()).toBe(false);

    // The browser loads /login (a new page load).
    dashboard.unmount();
    resetLogoutNoticeForTests();
    const loginPage = render(<LogoutNotice />);
    expect(screen.getByRole('status')).toHaveTextContent('Je bent succesvol uitgelogd.');
    loginPage.unmount();

    // A reload of /login does not show it again.
    resetLogoutNoticeForTests();
    render(<LogoutNotice />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('blocks protected routes after logout', async () => {
    await expect(logout()).resolves.toBe('ok');
    locationReplace.mockReset();

    render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );

    // No token in memory and the refresh is rejected: the guard sends the user to login.
    await waitFor(() =>
      expect(locationReplace).toHaveBeenCalledExactlyOnceWith('/login?next=%2Fdashboard'),
    );
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(calls(REFRESH_URL)).toHaveLength(1);
  });

  it('a /me request that is still pending during logout cannot show user data', async () => {
    const pendingMe = deferred<Response>();
    backend.handler.mockImplementationOnce(() => pendingMe.promise);

    render(
      <ProtectedRoute>
        <Email />
      </ProtectedRoute>,
    );
    await waitFor(() => expect(calls(ME_URL)).toHaveLength(1));

    await expect(logout()).resolves.toBe('ok');
    await act(async () => pendingMe.resolve(jsonResponse(200, USER)));

    expect(screen.queryByText(/Ingelogd als/)).not.toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('does not reuse a /me result of the ended session for a later session', async () => {
    await expect(fetchCurrentUser()).resolves.toMatchObject({ ok: true });
    await logout();

    // Without a new login the next check goes to the backend again and is rejected.
    await expect(fetchCurrentUser()).resolves.toEqual({ ok: false, error: 'unauthenticated' });
  });

  it('a second logout after the session has ended is handled as an already ended session', async () => {
    await expect(logout()).resolves.toBe('ok');
    startSession('stale-token');

    await expect(logout()).resolves.toBe('unauthenticated');

    expect(getAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem('nimbus.logout-notice')).toBe('session_ended');
  });

  it('can log in again after logout', async () => {
    await logout();
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText('E-mailadres'), 'john@example.com');
    await user.type(screen.getByLabelText('Wachtwoord'), 'Correct-Horse-Battery-1');
    await user.click(screen.getByRole('button', { name: 'Inloggen' }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/dashboard'));
    expect(getAccessToken()).toBe('new-login-token');
  });

  describe('multiple browser tabs', () => {
    it('ends the session in another tab when this tab logs out elsewhere', async () => {
      await renderDashboard();
      expect(getAccessToken()).toBe('session-token');

      // Another tab of the same browser logs out and sends the signal.
      const otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
      otherTab.postMessage(SESSION_ENDED_MESSAGE);
      otherTab.close();

      await waitFor(() =>
        expect(locationReplace).toHaveBeenCalledExactlyOnceWith('/login?next=%2Fdashboard'),
      );
      expect(getAccessToken()).toBeNull();
      // This tab did not log out itself: no request and no success message here.
      expect(calls(LOGOUT_URL)).toHaveLength(0);
      expect(window.sessionStorage.getItem('nimbus.logout-notice')).toBeNull();
    });

    it('ignores unrelated messages on the channel', async () => {
      await renderDashboard();

      const otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
      otherTab.postMessage({ type: 'something_else' });
      otherTab.postMessage('session_ended');
      otherTab.close();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      expect(locationReplace).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe('session-token');
    });

    it('does not react to its own logout signal', async () => {
      const user = userEvent.setup();
      await renderDashboard();

      await user.click(screen.getByRole('button', { name: 'Uitloggen' }));
      await user.click(
        within(screen.getByRole('dialog', { name: 'Uitloggen bij Nimbus?' })).getByRole('button', {
          name: 'Uitloggen',
        }),
      );
      await waitFor(() => expect(locationReplace).toHaveBeenCalled());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      // Only the logout redirect, not a second redirect with a return path.
      expect(locationReplace).toHaveBeenCalledExactlyOnceWith('/login');
    });

    it('sends only a signal without token or user data to other tabs', async () => {
      const received: unknown[] = [];
      const otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
      otherTab.onmessage = (event) => received.push(event.data);

      await logout();

      await waitFor(() => expect(received).toHaveLength(1));
      expect(received[0]).toEqual({ type: 'session_ended' });
      expect(JSON.stringify(received)).not.toContain('token');
      otherTab.close();
    });
  });

  it('never stores tokens or user data in browser storage', async () => {
    await renderDashboard();
    await logout();

    const stored = JSON.stringify({ ...window.localStorage, ...window.sessionStorage });
    expect(stored).not.toContain('session-token');
    expect(stored).not.toContain(USER.email);
    expect(Object.keys(window.sessionStorage)).toEqual(['nimbus.logout-notice']);
  });
});
