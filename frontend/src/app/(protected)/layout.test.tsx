import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, setAccessToken } from '../../features/auth/session/accessToken';
import DashboardPage from './dashboard/page';
import ProtectedLayout from './layout';

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

  it('guards the dashboard page: hidden while the session is being checked', async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (respond = resolve)));

    render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );

    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Finish the pending request so it is not shared with the next test.
    respond(new Response(null, { status: 500 }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows the dashboard page once /me confirmed the user', async () => {
    setAccessToken('current-access-token');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(USER), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/users/me',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
