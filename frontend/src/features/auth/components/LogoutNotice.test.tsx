import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../../app/login/page';
import { LOGOUT_NOTICE_STORAGE_KEY, markLogoutNotice } from '../logoutNotice';
import { LogoutNotice, resetLogoutNoticeForTests } from './LogoutNotice';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const SUCCESS = 'Je bent succesvol uitgelogd.';
const SESSION_ENDED = 'Je sessie was al beëindigd. Log opnieuw in om verder te gaan.';

/** Simulates a new page load: the module re-reads the storage on the next render. */
function newPageLoad() {
  resetLogoutNoticeForTests();
}

async function flushDeferredCleanup() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('LogoutNotice', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    newPageLoad();
    vi.restoreAllMocks();
  });

  it('shows nothing without a confirmed logout', () => {
    newPageLoad();
    render(<LogoutNotice />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the success snackbar once after a confirmed logout', () => {
    markLogoutNotice('logged_out');
    newPageLoad();

    render(<LogoutNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    // Read once: the flag is gone, so a reload does not show it again.
    expect(window.sessionStorage.getItem(LOGOUT_NOTICE_STORAGE_KEY)).toBeNull();
  });

  it('does not show the snackbar again after a reload', () => {
    markLogoutNotice('logged_out');
    newPageLoad();
    const first = render(<LogoutNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS);
    first.unmount();

    newPageLoad();
    render(<LogoutNotice />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not show the snackbar again after leaving the login page and coming back', async () => {
    markLogoutNotice('logged_out');
    newPageLoad();
    const first = render(<LogoutNotice />);
    first.unmount();
    await flushDeferredCleanup();

    render(<LogoutNotice />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('can be dismissed and does not block the page', async () => {
    markLogoutNotice('logged_out');
    newPageLoad();
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.getByRole('status')).toHaveTextContent(SUCCESS);
    // The login form stays usable while the snackbar is visible.
    await user.type(screen.getByLabelText('E-mailadres'), 'john@example.com');
    expect(screen.getByLabelText('E-mailadres')).toHaveValue('john@example.com');

    await user.click(screen.getByRole('button', { name: 'Melding sluiten' }));

    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
  });

  it('shows a neutral message, not the success message, when the session had already ended', () => {
    markLogoutNotice('session_ended');
    newPageLoad();

    render(<LogoutNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(SESSION_ENDED);
    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
  });

  it('ignores unknown stored values', () => {
    window.sessionStorage.setItem(LOGOUT_NOTICE_STORAGE_KEY, 'something-else');
    newPageLoad();

    render(<LogoutNotice />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('renders the login page normally when storage is not available', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    newPageLoad();

    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Inloggen' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the snackbar at the top: in the page flow on mobile, floating from tablet', () => {
    markLogoutNotice('logged_out');
    newPageLoad();

    render(<LogoutNotice />);

    // Mobile: the live region moves to the top of the login page flow, so the snackbar pushes the
    // content down instead of covering the logo.
    expect(screen.getByRole('status').className).toContain('order-first');
    const wrapper = screen.getByText(SUCCESS).parentElement?.parentElement;
    expect(wrapper?.className).toContain('justify-center');
    expect(wrapper?.className).toMatch(/(^|\s)pt-4(\s|$)/);
    expect(wrapper?.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    // From 768px: floating at the top, horizontally centered.
    expect(wrapper?.className).toContain('md:fixed');
    expect(wrapper?.className).toContain('md:top-6');
    expect(wrapper?.className).not.toMatch(/bottom-/);
  });
});
