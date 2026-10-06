import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOGIN_ERROR_MESSAGES } from '../messages';
import { clearAccessToken, getAccessToken } from '../session/accessToken';
import { LOGIN_VALIDATION_MESSAGES } from '../validation';
import { LoginForm } from './LoginForm';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const EMAIL = 'user@example.com';
const PASSWORD = 'Correct-Horse-1';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const successBody = { access_token: 'access-token-value', token_type: 'bearer', expires_in: 900 };

function setup() {
  const user = userEvent.setup();
  render(<LoginForm />);

  return {
    user,
    emailInput: screen.getByLabelText('E-mailadres'),
    passwordInput: screen.getByLabelText('Wachtwoord'),
    submitButton: screen.getByRole('button', { name: 'Inloggen' }),
  };
}

async function fillAndSubmit(email = EMAIL, password = PASSWORD) {
  const elements = setup();
  await elements.user.type(elements.emailInput, email);
  await elements.user.type(elements.passwordInput, password);
  await elements.user.click(elements.submitButton);
  return elements;
}

describe('LoginForm', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    replaceMock.mockReset();
    clearAccessToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('shows the email field, password field and Inloggen button', () => {
      const { emailInput, passwordInput, submitButton } = setup();

      expect(screen.getByRole('heading', { level: 1, name: 'Welkom terug' })).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('autocomplete', 'email');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
      expect(passwordInput).toHaveAttribute('maxlength', '1024');
      expect(submitButton).toHaveAttribute('type', 'submit');
      expect(submitButton).toBeEnabled();
    });

    it('shows neutral security copy instead of certification claims', () => {
      setup();

      expect(screen.getByText('Privacygericht ontworpen')).toBeInTheDocument();
      expect(screen.getByText('Veilige sessies')).toBeInTheDocument();
      expect(screen.getByText('Beveiligde toegang')).toBeInTheDocument();
      expect(screen.queryByText(/SOC 2|GDPR|ISO 27001/)).not.toBeInTheDocument();
    });
  });

  describe('features of other stories', () => {
    it('shows Remember Me as a disabled checkbox', () => {
      setup();

      expect(screen.getByRole('checkbox', { name: 'Onthoud mij' })).toBeDisabled();
    });

    it('shows Google login as a disabled button', () => {
      setup();

      expect(screen.getByRole('button', { name: 'Inloggen met Google' })).toBeDisabled();
    });

    it('shows forgot password and registration as plain, non-interactive text', () => {
      setup();

      expect(screen.getByText('Wachtwoord vergeten?').tagName).toBe('SPAN');
      expect(screen.getByText('Maak een account aan').tagName).toBe('SPAN');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /vergeten|account/i })).not.toBeInTheDocument();
    });

    it('keeps the disabled elements out of the keyboard tab order', async () => {
      const { user, emailInput, passwordInput, submitButton } = setup();

      await user.tab();
      expect(emailInput).toHaveFocus();
      await user.tab();
      expect(passwordInput).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Wachtwoord tonen' })).toHaveFocus();
      await user.tab();
      expect(submitButton).toHaveFocus();
      await user.tab();
      expect(document.body).toHaveFocus();
    });
  });

  describe('client-side validation', () => {
    it('requires an email address without sending a request', async () => {
      const { user, emailInput, passwordInput, submitButton } = setup();
      await user.type(passwordInput, PASSWORD);
      await user.click(submitButton);

      expect(screen.getByText(LOGIN_VALIDATION_MESSAGES.emailRequired)).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('aria-invalid', 'true');
      expect(emailInput).toHaveAccessibleDescription(LOGIN_VALIDATION_MESSAGES.emailRequired);
      expect(emailInput).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid email format without sending a request', async () => {
      await fillAndSubmit('test', PASSWORD);

      expect(screen.getByText(LOGIN_VALIDATION_MESSAGES.emailInvalid)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requires a password without sending a request', async () => {
      const { user, emailInput, passwordInput, submitButton } = setup();
      await user.type(emailInput, EMAIL);
      await user.click(submitButton);

      expect(screen.getByText(LOGIN_VALIDATION_MESSAGES.passwordRequired)).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
      expect(passwordInput).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('clears a field error when the field is changed', async () => {
      const { user, emailInput, submitButton } = setup();
      await user.click(submitButton);
      await user.type(emailInput, 'u');

      expect(screen.queryByText(LOGIN_VALIDATION_MESSAGES.emailRequired)).not.toBeInTheDocument();
      expect(emailInput).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('password visibility', () => {
    it('toggles between hidden and visible', async () => {
      const { user, passwordInput } = setup();
      await user.type(passwordInput, PASSWORD);

      await user.click(screen.getByRole('button', { name: 'Wachtwoord tonen' }));
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(screen.getByRole('button', { name: 'Wachtwoord verbergen' }));
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('successful login', () => {
    it('sends the login request with credentials included', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, successBody));

      await fillAndSubmit(`  ${EMAIL} `, ` ${PASSWORD} `);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/api/auth/login');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      expect(JSON.parse(init?.body as string)).toEqual({
        email: EMAIL,
        password: ` ${PASSWORD} `,
      });
    });

    it('keeps the access token in memory and redirects to the dashboard', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, successBody));
      const localSetItem = vi.spyOn(Storage.prototype, 'setItem');

      await fillAndSubmit();

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
      expect(getAccessToken()).toBe('access-token-value');
      expect(localSetItem).not.toHaveBeenCalled();
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      expect(document.cookie).not.toContain('access-token-value');
    });

    it('does not accept an invalid success response', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'x', token_type: 'mac' }));

      await fillAndSubmit();

      expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_ERROR_MESSAGES.server);
      expect(getAccessToken()).toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe('failed login', () => {
    it.each([
      [401, LOGIN_ERROR_MESSAGES.invalid_credentials],
      [422, LOGIN_ERROR_MESSAGES.validation],
      [429, 'Te veel inlogpogingen. Probeer het over een minuut opnieuw.'],
      [500, LOGIN_ERROR_MESSAGES.server],
    ])('shows a generic message for HTTP %i and stays on the page', async (status, message) => {
      fetchMock.mockResolvedValue(jsonResponse(status, { error: { code: 'X', message: 'Y' } }));

      const { submitButton, passwordInput } = await fillAndSubmit();

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(replaceMock).not.toHaveBeenCalled();
      expect(getAccessToken()).toBeNull();
      expect(submitButton).toBeEnabled();
      expect(passwordInput).toHaveValue(PASSWORD);
    });

    it('does not reveal whether the email address exists', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid' } }),
      );

      await fillAndSubmit();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord.',
      );
      expect(alert).not.toHaveTextContent(/bestaat|onbekend|niet gevonden/i);
    });

    it('shows a general message when the API is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await fillAndSubmit();

      expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_ERROR_MESSAGES.network);
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('clears the previous error when submitting again', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
      fetchMock.mockResolvedValueOnce(jsonResponse(200, successBody));

      const { user, submitButton } = await fillAndSubmit();
      await screen.findByRole('alert');

      await user.click(submitButton);

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('submitting state', () => {
    it('shows a loading state and prevents duplicate submits', async () => {
      let resolveRequest: (response: Response) => void = () => {};
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      );

      const { user, emailInput, passwordInput, submitButton } = setup();
      await user.type(emailInput, EMAIL);
      await user.type(passwordInput, PASSWORD);
      await user.click(submitButton);

      const loadingButton = screen.getByRole('button', { name: 'Bezig…' });
      expect(loadingButton).toBeDisabled();
      expect(loadingButton).toHaveAttribute('aria-busy', 'true');
      expect(loadingButton.closest('form')).toHaveAttribute('aria-busy', 'true');

      await user.click(loadingButton);
      await user.type(passwordInput, '{enter}');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      resolveRequest(jsonResponse(200, successBody));
      await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('sensitive data', () => {
    it('does not log credentials or tokens to the console', async () => {
      const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        vi.spyOn(console, method),
      );
      fetchMock.mockResolvedValue(jsonResponse(200, successBody));

      await fillAndSubmit();
      await waitFor(() => expect(replaceMock).toHaveBeenCalled());

      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });
});
