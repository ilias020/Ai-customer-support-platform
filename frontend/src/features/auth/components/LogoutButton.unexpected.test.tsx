import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LOGOUT_ERROR_MESSAGES } from '../messages';
import { LogoutButton } from './LogoutButton';

const logoutMock = vi.hoisted(() => vi.fn());

vi.mock('../session/logout', () => ({ logout: logoutMock }));

describe('LogoutButton with an unexpected rejection', () => {
  it('shows an error and releases the dialog instead of staying blocked', async () => {
    logoutMock.mockRejectedValueOnce(new Error('unexpected'));
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: 'Uitloggen' }));
    const dialog = screen.getByRole('dialog', { name: 'Uitloggen bij Nimbus?' });
    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      LOGOUT_ERROR_MESSAGES.unexpected,
    );
    expect(within(dialog).getByRole('button', { name: 'Uitloggen' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Annuleren' })).toBeEnabled();

    // The user can close the dialog or try again.
    logoutMock.mockResolvedValueOnce('ok');
    await user.click(within(dialog).getByRole('button', { name: 'Uitloggen' }));
    expect(logoutMock).toHaveBeenCalledTimes(2);
  });
});
