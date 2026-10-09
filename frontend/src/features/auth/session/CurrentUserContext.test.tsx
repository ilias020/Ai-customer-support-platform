import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '../api/currentUser';
import { CurrentUserProvider, useCurrentUser } from './CurrentUserContext';

const USER: CurrentUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'john@example.com',
  first_name: 'John',
  last_name: 'Doe',
  status: 'ACTIVE',
  language: 'nl',
  timezone: 'Europe/Amsterdam',
  last_login_at: null,
  created_at: '2026-08-20T09:30:00Z',
};

function Profile() {
  const user = useCurrentUser();
  return (
    <p>
      {user.first_name} · {user.language} · {user.timezone} · {String(user.last_login_at)}
    </p>
  );
}

describe('useCurrentUser', () => {
  it('returns the user provided by the protected route', () => {
    render(
      <CurrentUserProvider user={USER}>
        <Profile />
      </CurrentUserProvider>,
    );

    expect(screen.getByText('John · nl · Europe/Amsterdam · null')).toBeInTheDocument();
  });

  it('cannot be used outside a protected page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Profile />)).toThrow(/inside a protected page/);

    vi.restoreAllMocks();
  });
});
