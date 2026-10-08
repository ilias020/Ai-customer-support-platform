import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, setAccessToken } from '../../features/auth/session/accessToken';
import DashboardPage from './dashboard/page';
import ProtectedLayout from './layout';

describe('ProtectedLayout (central guard for the (protected) route group)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    clearAccessToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('guards the dashboard page: hidden while the session is being checked', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );

    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the dashboard page with a valid session', async () => {
    setAccessToken('current-access-token');

    render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
});
