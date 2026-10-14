import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CurrentUser } from '../../../features/auth/api/currentUser';
import {
  clearRegistrationNotice,
  markRegistrationCompleted,
} from '../../../features/auth/registrationNotice';
import { CurrentUserProvider } from '../../../features/auth/session/CurrentUserContext';
import DashboardPage from './page';

const USER: CurrentUser = {
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

function renderDashboard() {
  return render(
    <CurrentUserProvider user={USER}>
      <DashboardPage />
    </CurrentUserProvider>,
  );
}

describe('DashboardPage (temporary login redirect destination)', () => {
  afterEach(() => clearRegistrationNotice());

  it('renders a minimal placeholder heading', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows no welcome notice without a registration', () => {
    renderDashboard();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the welcome notice once after a registration', () => {
    markRegistrationCompleted();

    const first = renderDashboard();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Welkom bij Nimbus, John! Je account en workspace zijn aangemaakt.',
    );
    first.unmount();

    renderDashboard();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
