import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_GUARD_MESSAGES } from '../messages';
import { clearAccessToken, getAccessToken, setAccessToken } from '../session/accessToken';
import { ProtectedRoute } from './ProtectedRoute';

const REFRESH_URL = 'http://localhost:8000/api/auth/refresh';
const PROTECTED_TEXT = 'Geheime dashboardinhoud';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const refreshSuccess = () =>
  jsonResponse(200, {
    access_token: 'renewed-access-token',
    token_type: 'bearer',
    expires_in: 900,
  });
const refreshRejected = () =>
  jsonResponse(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'x' }, request_id: 'r' });
const serverError = () =>
  jsonResponse(500, { error: { code: 'INTERNAL_SERVER_ERROR', message: 'x' }, request_id: 'r' });

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

function renderGuard() {
  return render(
    <ProtectedRoute>
      <Protected />
    </ProtectedRoute>,
  );
}

function refreshCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => url === REFRESH_URL).length;
}

/** Lets pending promises and React updates settle, to prove nothing else happens afterwards. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('ProtectedRoute', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const replaceMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('with an access token in memory', () => {
    it('renders the protected content without refreshing the session', async () => {
      setAccessToken('current-access-token');

      renderGuard();

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not refresh again on repeated renders', async () => {
      setAccessToken('current-access-token');
      const { rerender } = renderGuard();
      await screen.findByText(PROTECTED_TEXT);

      for (let i = 0; i < 5; i += 1) {
        rerender(
          <ProtectedRoute>
            <Protected />
          </ProtectedRoute>,
        );
      }
      await settle();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText(PROTECTED_TEXT)).toBeInTheDocument();
    });
  });

  describe('without an access token (direct navigation or browser refresh)', () => {
    it('hides protected content while the session check is running', async () => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValueOnce(pending.promise);

      renderGuard();

      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(SESSION_GUARD_MESSAGES.checking);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();

      pending.resolve(refreshSuccess());

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
    });

    it('restores the session through the refresh cookie and grants access', async () => {
      fetchMock.mockResolvedValueOnce(refreshSuccess());

      renderGuard();

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        REFRESH_URL,
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
      expect(getAccessToken()).toBe('renewed-access-token');
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('keeps access after the refresh without refreshing again on re-renders', async () => {
      fetchMock.mockResolvedValueOnce(refreshSuccess());
      const { rerender } = renderGuard();
      await screen.findByText(PROTECTED_TEXT);

      rerender(
        <ProtectedRoute>
          <Protected />
        </ProtectedRoute>,
      );
      await settle();

      expect(refreshCalls(fetchMock)).toBe(1);
      expect(screen.getByText(PROTECTED_TEXT)).toBeInTheDocument();
    });

    it('sends a single refresh request in React Strict Mode', async () => {
      fetchMock.mockResolvedValue(refreshSuccess());

      render(
        <StrictMode>
          <ProtectedRoute>
            <Protected />
          </ProtectedRoute>
        </StrictMode>,
      );

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      await settle();
      expect(refreshCalls(fetchMock)).toBe(1);
    });

    it('shares one refresh request between multiple guards', async () => {
      fetchMock.mockResolvedValue(refreshSuccess());

      render(
        <>
          <ProtectedRoute>
            <Protected />
          </ProtectedRoute>
          <ProtectedRoute>
            <p>Tweede beveiligd onderdeel</p>
          </ProtectedRoute>
        </>,
      );

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(await screen.findByText('Tweede beveiligd onderdeel')).toBeInTheDocument();
      expect(refreshCalls(fetchMock)).toBe(1);
    });
  });

  describe('when the backend rejects the session (refresh 401, e.g. expired or revoked)', () => {
    it('redirects to login with the requested page as return path', async () => {
      fetchMock.mockResolvedValueOnce(refreshRejected());

      renderGuard();

      await waitFor(() =>
        expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fdashboard%3Ftab%3Dopen'),
      );
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(SESSION_GUARD_MESSAGES.redirecting);
      expect(getAccessToken()).toBeNull();
    });

    it('redirects only once and does not refresh again (no loop)', async () => {
      fetchMock.mockResolvedValue(refreshRejected());

      const { rerender } = render(
        <StrictMode>
          <ProtectedRoute>
            <Protected />
          </ProtectedRoute>
        </StrictMode>,
      );
      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      rerender(
        <StrictMode>
          <ProtectedRoute>
            <Protected />
          </ProtectedRoute>
        </StrictMode>,
      );
      await settle();

      expect(refreshCalls(fetchMock)).toBe(1);
      expect(replaceMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    });
  });

  describe.each([
    ['server error (500)', () => fetchMock.mockResolvedValueOnce(serverError())],
    ['network error', () => fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))],
  ])('on a %s during the session check', (_label, arrangeFailure) => {
    it('shows a controlled error without protected content, redirect or retries', async () => {
      arrangeFailure();

      renderGuard();

      expect(await screen.findByRole('alert')).toHaveTextContent(SESSION_GUARD_MESSAGES.error);
      await settle();
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('lets the user retry once explicitly and grants access when it succeeds', async () => {
      arrangeFailure();
      fetchMock.mockResolvedValueOnce(refreshSuccess());
      const user = userEvent.setup();

      renderGuard();
      await user.click(await screen.findByRole('button', { name: 'Opnieuw proberen' }));

      expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('redirects to login when the retry is rejected by the backend', async () => {
      arrangeFailure();
      fetchMock.mockResolvedValueOnce(refreshRejected());
      const user = userEvent.setup();

      renderGuard();
      await user.click(await screen.findByRole('button', { name: 'Opnieuw proberen' }));

      await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    });
  });

  it('keeps an existing in-memory token on a server error (no automatic logout)', async () => {
    // A token that is set while the check is running must not be cleared by a 500.
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    renderGuard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    setAccessToken('token-from-other-flow');
    pending.resolve(serverError());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(getAccessToken()).toBe('token-from-other-flow');
  });

  it('does not render protected content during server rendering', () => {
    setAccessToken('current-access-token');

    const html = renderToString(
      <ProtectedRoute>
        <Protected />
      </ProtectedRoute>,
    );

    expect(html).not.toContain(PROTECTED_TEXT);
    expect(html).toContain(SESSION_GUARD_MESSAGES.checking);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
