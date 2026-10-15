import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGOUT_DIALOG_TEXT, LOGOUT_ERROR_MESSAGES } from '../messages';
import { clearAccessToken, getAccessToken, startSession } from '../session/accessToken';
import { resetSessionChannelForTests } from '../session/sessionBroadcast';
import { LogoutButton } from './LogoutButton';

const API = 'http://localhost:8000';
const LOGOUT_URL = `${API}/api/auth/logout`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('LogoutButton', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const replaceMock = vi.fn();
  const logoutCalls = () => fetchMock.mock.calls.filter(([url]) => url === LOGOUT_URL);

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', {
      pathname: '/dashboard',
      search: '',
      hash: '',
      replace: replaceMock,
    });
    startSession('session-token');
  });

  afterEach(() => {
    resetSessionChannelForTests();
    fetchMock.mockReset();
    replaceMock.mockReset();
    clearAccessToken();
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function setup() {
    const user = userEvent.setup();
    render(<LogoutButton />);
    const trigger = screen.getByRole('button', { name: 'Uitloggen' });
    return { user, trigger };
  }

  async function openDialog() {
    const context = setup();
    await context.user.click(context.trigger);
    const dialog = screen.getByRole('dialog', { name: LOGOUT_DIALOG_TEXT.title });
    return { ...context, dialog };
  }

  it('shows an Uitloggen action that opens a dialog', async () => {
    const { trigger } = setup();

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the confirmation dialog with title, description and both actions', async () => {
    const { dialog } = await openDialog();

    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleName('Uitloggen bij Nimbus?');
    expect(dialog).toHaveAccessibleDescription(
      'Weet je zeker dat je wilt uitloggen? Je kunt op ieder moment opnieuw inloggen.',
    );
    expect(within(dialog).getByRole('button', { name: 'Annuleren' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Uitloggen' })).toBeVisible();
    // The safe action has the initial focus.
    expect(within(dialog).getByRole('button', { name: 'Annuleren' })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes the dialog on Annuleren without a request and keeps the session', async () => {
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Annuleren' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('session-token');
  });

  it('closes the dialog on Escape without a request', async () => {
    const { dialog } = await openDialog();

    fireEvent(dialog, new Event('cancel', { cancelable: true }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends exactly one logout request, even after repeated clicks', async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const { user, dialog } = await openDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Uitloggen' });

    // Two clicks before React re-renders the disabled button (same task).
    act(() => {
      confirm.click();
      confirm.click();
    });
    await user.click(confirm);
    fireEvent.click(confirm);

    expect(logoutCalls()).toHaveLength(1);
    await act(async () => response.resolve(new Response(null, { status: 204 })));
    expect(logoutCalls()).toHaveLength(1);
  });

  it('shows a loading state and cannot be closed while the logout runs', async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

    const busyButton = within(dialog).getByRole('button', { name: /Uitloggen…/ });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Annuleren' })).toBeDisabled();

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).toHaveAttribute('open');

    await act(async () => response.resolve(new Response(null, { status: 204 })));
  });

  it('after 204 clears the access token and navigates to the login page', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(getAccessToken()).toBeNull();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('after 401 also ends the local session (the session had already ended)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(getAccessToken()).toBeNull();
  });

  it.each([
    [
      '500',
      () => Promise.resolve(new Response('{}', { status: 500 })),
      LOGOUT_ERROR_MESSAGES.server,
    ],
    [
      'a network error',
      () => Promise.reject(new TypeError('Failed to fetch')),
      LOGOUT_ERROR_MESSAGES.network,
    ],
  ])(
    'after %s shows an error, keeps the session and allows a retry',
    async (_, respond, message) => {
      fetchMock.mockImplementationOnce(respond);
      const { user, dialog } = await openDialog();

      await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
      expect(getAccessToken()).toBe('session-token');
      expect(replaceMock).not.toHaveBeenCalled();
      expect(window.sessionStorage.length).toBe(0);
      expect(within(dialog).getByRole('button', { name: 'Uitloggen' })).toBeEnabled();

      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

      await waitFor(() => expect(replaceMock).toHaveBeenCalledExactlyOnceWith('/login'));
      expect(logoutCalls()).toHaveLength(2);
    },
  );

  it('shows an error when the Web Lock fails unexpectedly', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: vi.fn().mockRejectedValue(new Error('lock failed')) },
    });
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      LOGOUT_ERROR_MESSAGES.unexpected,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('session-token');
  });

  it('clears a previous error when the dialog is opened again', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const { user, trigger, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));
    await within(dialog).findByRole('alert');

    await user.click(within(dialog).getByRole('button', { name: 'Annuleren' }));
    await user.click(trigger);

    expect(
      within(screen.getByRole('dialog', { name: LOGOUT_DIALOG_TEXT.title })).queryByRole('alert'),
    ).not.toBeInTheDocument();
  });
});
