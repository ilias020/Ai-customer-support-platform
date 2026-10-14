import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedLayout from '../../app/(protected)/layout';
import DashboardPage from '../../app/(protected)/dashboard/page';
import { RegisterForm } from './components/RegisterForm';
import { clearRegistrationNotice } from './registrationNotice';
import { clearAccessToken } from './session/accessToken';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const API = 'http://localhost:8000';
const PASSWORD = 'Correct-Horse-9';
const USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'john@example.com',
  first_name: 'John',
  last_name: 'Doe',
  status: 'ACTIVE',
  language: 'en',
  timezone: 'UTC',
  last_login_at: '2026-10-14T08:00:00Z',
  created_at: '2026-10-14T08:00:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('registration flow: form → session → /me → dashboard', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => url === `${API}${path}`);

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', API);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === `${API}/api/auth/register`) {
        return jsonResponse(201, {
          access_token: 'registered-token',
          token_type: 'bearer',
          expires_in: 900,
        });
      }
      if (url === `${API}/api/users/me`) return jsonResponse(200, USER);
      throw new Error(`Unexpected request to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    replaceMock.mockReset();
    clearAccessToken();
    clearRegistrationNotice();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function registerAndOpenDashboard() {
    const user = userEvent.setup();
    const form = render(<RegisterForm />);
    await user.type(screen.getByLabelText('Voornaam'), 'John');
    await user.type(screen.getByLabelText('Achternaam'), 'Doe');
    await user.type(screen.getByLabelText('E-mailadres'), 'john@example.com');
    await user.type(screen.getByLabelText('Bedrijfsnaam'), 'Example Company');
    await user.type(screen.getByLabelText('Wachtwoord'), PASSWORD);
    await user.type(screen.getByLabelText('Herhaal wachtwoord'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Account aanmaken' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    form.unmount();

    // router.replace('/dashboard') renders the protected layout with the dashboard page.
    return render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );
  }

  it('confirms the new user via /me without a refresh and shows the welcome once', async () => {
    const dashboard = await registerAndOpenDashboard();

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Welkom bij Nimbus, John! Je account en workspace zijn aangemaakt.',
    );
    expect(callsTo('/api/auth/refresh')).toHaveLength(0);
    expect(callsTo('/api/users/me')).toHaveLength(1);
    const [, init] = callsTo('/api/users/me')[0];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer registered-token');

    // The notice does not block the page and can be dismissed.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Melding sluiten' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // Opening the dashboard again (e.g. navigating back) does not show it again.
    dashboard.unmount();
    render(
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>,
    );
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/Welkom bij Nimbus/)).not.toBeInTheDocument();
  });
});
