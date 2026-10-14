import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGISTER_ERROR_MESSAGES } from '../messages';
import { clearRegistrationNotice, isRegistrationNoticePending } from '../registrationNotice';
import { REGISTER_VALIDATION_MESSAGES as M } from '../registerValidation';
import { clearAccessToken, getAccessToken, getSessionVersion } from '../session/accessToken';
import { PASSWORD_REQUIREMENTS_MET } from './PasswordRequirements';
import { RegisterForm } from './RegisterForm';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const REGISTER_URL = 'http://localhost:8000/api/auth/register';
const PASSWORD = 'Correct Horse-9';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const created = () =>
  jsonResponse(201, { access_token: 'registered-token', token_type: 'bearer', expires_in: 900 });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup() {
  const user = userEvent.setup();
  render(<RegisterForm />);

  const fields = {
    firstName: screen.getByLabelText('Voornaam'),
    lastName: screen.getByLabelText('Achternaam'),
    email: screen.getByLabelText('E-mailadres'),
    workspaceName: screen.getByLabelText('Bedrijfsnaam'),
    password: screen.getByLabelText('Wachtwoord'),
    passwordConfirmation: screen.getByLabelText('Herhaal wachtwoord'),
  };

  async function fill(overrides: Partial<Record<keyof typeof fields, string>> = {}) {
    const values = {
      firstName: '  John ',
      lastName: 'Doe',
      email: ' John@Example.com ',
      workspaceName: ' Example Company ',
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
      ...overrides,
    };
    for (const [field, value] of Object.entries(values)) {
      if (value) await user.type(fields[field as keyof typeof fields], value);
    }
  }

  const submit = () => user.click(screen.getByRole('button', { name: 'Account aanmaken' }));

  return { user, fields, fill, submit };
}

describe('RegisterForm', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const registerCalls = () => fetchMock.mock.calls.filter(([url]) => url === REGISTER_URL);

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    replaceMock.mockReset();
    clearAccessToken();
    clearRegistrationNotice();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('shows all registration fields with labels and professional placeholders', () => {
      const { fields } = setup();

      expect(screen.getByRole('heading', { level: 1, name: 'Maak je account aan' })).toBeVisible();
      expect(fields.email).toHaveAttribute('type', 'email');
      expect(fields.email).toHaveAttribute('autocomplete', 'email');
      expect(fields.password).toHaveAttribute('type', 'password');
      expect(fields.password).toHaveAttribute('autocomplete', 'new-password');
      expect(fields.passwordConfirmation).toHaveAttribute('autocomplete', 'new-password');
      expect(fields.firstName).toHaveAttribute('placeholder', 'Vul je voornaam in');
      expect(fields.lastName).toHaveAttribute('placeholder', 'Vul je achternaam in');
      expect(fields.email).toHaveAttribute('placeholder', 'naam@bedrijf.nl');
      expect(fields.workspaceName).toHaveAttribute('placeholder', 'Vul je bedrijfsnaam in');
    });

    it('links back to the login page', () => {
      setup();

      expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/login');
    });

    it('can show and hide both passwords', async () => {
      const { user, fields } = setup();
      const [showPassword, showConfirmation] = screen.getAllByRole('button', {
        name: 'Wachtwoord tonen',
      });

      await user.click(showPassword);
      expect(fields.password).toHaveAttribute('type', 'text');
      expect(fields.passwordConfirmation).toHaveAttribute('type', 'password');
      await user.click(showConfirmation);
      expect(fields.passwordConfirmation).toHaveAttribute('type', 'text');
    });
  });

  describe('live password requirements', () => {
    const rowState = () =>
      Object.fromEntries(
        screen.getAllByRole('listitem').map((item) => [
          item.textContent
            ?.replace(/\s*\((nog niet )?voldaan\)$/, '')
            .slice(1)
            .trim(),
          item.dataset.met,
        ]),
      );

    it('stays hidden while the password field is still empty and unused', () => {
      const { fields } = setup();

      expect(screen.queryByText('Je wachtwoord moet bevatten:')).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(fields.password).not.toHaveAttribute('aria-describedby');
    });

    it('appears while typing and checks every requirement separately', async () => {
      const { user, fields } = setup();

      await user.type(fields.password, 'a');
      expect(screen.getByText('Je wachtwoord moet bevatten:')).toBeVisible();
      expect(rowState()).toEqual({
        '12 tot 128 tekens': 'false',
        'Een hoofdletter (A–Z)': 'false',
        'Een kleine letter (a–z)': 'true',
        'Een cijfer (0–9)': 'false',
        'Een speciaal teken, zoals ! @ # of €': 'false',
      });

      await user.type(fields.password, 'A1');
      expect(rowState()['Een hoofdletter (A–Z)']).toBe('true');
      expect(rowState()['Een cijfer (0–9)']).toBe('true');
      expect(rowState()['12 tot 128 tekens']).toBe('false');
      expect(screen.getAllByText('(nog niet voldaan)')).toHaveLength(2);
      expect(fields.password).toHaveAccessibleDescription(expect.stringContaining('(voldaan)'));
    });

    it('does not count a space as special character but does allow spaces', async () => {
      const { user, fields } = setup();

      await user.type(fields.password, 'Abc def ghij1');
      expect(rowState()['Een speciaal teken, zoals ! @ # of €']).toBe('false');
      expect(rowState()['12 tot 128 tekens']).toBe('true');

      await user.type(fields.password, '€');
      expect(
        screen.getByText(PASSWORD_REQUIREMENTS_MET, { selector: 'p:not([aria-live])' }),
      ).toBeVisible();
    });

    it('counts Unicode code points, like the backend', async () => {
      const { user, fields } = setup();

      await user.type(fields.password, 'Abcdefghi1😀'); // 11 code points, 12 UTF-16 units
      expect(rowState()['12 tot 128 tekens']).toBe('false');
    });

    it('shows a compact confirmation and announces it once all requirements are met', async () => {
      const { user, fields } = setup();

      await user.type(fields.password, 'Correct Horse-9');

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.getAllByText(PASSWORD_REQUIREMENTS_MET)).toHaveLength(2); // visible + live region
      expect(
        screen
          .getAllByText(PASSWORD_REQUIREMENTS_MET)
          .some((el) => el.getAttribute('aria-live') === 'polite'),
      ).toBe(true);
    });

    it('keeps the requirements visible after clearing the field (no layout jump back)', async () => {
      const { user, fields } = setup();

      await user.type(fields.password, 'ab');
      await user.clear(fields.password);

      expect(screen.getByText('Je wachtwoord moet bevatten:')).toBeVisible();
    });

    it('keeps the field error visible next to the requirements after a submit attempt', async () => {
      const { user, fill, submit, fields } = setup();
      await fill({ password: 'Aaaaaaaaaaa1', passwordConfirmation: 'Aaaaaaaaaaa1' });

      await submit();

      expect(screen.getByText(M.passwordComposition)).toBeVisible();
      expect(screen.getByText('Je wachtwoord moet bevatten:')).toBeVisible();
      expect(fields.password).toHaveAttribute(
        'aria-describedby',
        'password-error password-requirements',
      );
      expect(fetchMock).not.toHaveBeenCalled();
      await user.type(fields.password, '!');
      expect(screen.queryByText(M.passwordComposition)).not.toBeInTheDocument();
    });
  });

  describe('client-side validation', () => {
    it('shows field errors, focuses the first one and sends no request', async () => {
      const { fields, submit } = setup();

      await submit();

      expect(screen.getByText(M.firstNameRequired)).toBeInTheDocument();
      expect(screen.getByText(M.passwordRequired)).toBeInTheDocument();
      expect(fields.firstName).toHaveAttribute('aria-invalid', 'true');
      expect(fields.firstName).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['Abcdefgh1!x', M.passwordTooShort],
      ['abcdefghij1!', M.passwordComposition],
      ['ABCDEFGHIJ1!', M.passwordComposition],
      ['Abcdefghijk!', M.passwordComposition],
      ['Abcdef ghij1', M.passwordComposition],
    ])('rejects password %s', async (password, message) => {
      const { fill, submit, fields } = setup();
      await fill({ password, passwordConfirmation: password });

      await submit();

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(fields.password).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a confirmation that does not match', async () => {
      const { fill, submit, fields } = setup();
      await fill({ passwordConfirmation: 'Correct Horse-8' });

      await submit();

      expect(screen.getByText(M.passwordMismatch)).toBeInTheDocument();
      expect(fields.passwordConfirmation).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('clears a field error while typing', async () => {
      const { user, submit, fields } = setup();
      await submit();

      await user.type(fields.firstName, 'J');

      expect(screen.queryByText(M.firstNameRequired)).not.toBeInTheDocument();
    });
  });

  describe('successful registration', () => {
    it('sends the five contract fields without the confirmation and the password untrimmed', async () => {
      fetchMock.mockResolvedValue(created());
      const { fill, submit } = setup();
      await fill({ password: ' Correct Horse-9 ', passwordConfirmation: ' Correct Horse-9 ' });

      await submit();

      await waitFor(() => expect(registerCalls()).toHaveLength(1));
      const [, init] = registerCalls()[0];
      expect(init?.credentials).toBe('include');
      expect(JSON.parse(String(init?.body))).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        email: 'John@Example.com',
        password: ' Correct Horse-9 ',
        workspace_name: 'Example Company',
      });
    });

    it('starts a new session in memory and goes to the dashboard', async () => {
      fetchMock.mockResolvedValue(created());
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const versionBefore = getSessionVersion();
      const { fill, submit } = setup();
      await fill();

      await submit();

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
      expect(getAccessToken()).toBe('registered-token');
      // startSession(), not setAccessToken(): requests of a previous session are discarded.
      expect(getSessionVersion()).toBe(versionBefore + 1);
      expect(isRegistrationNoticePending()).toBe(true);
      expect(setItem).not.toHaveBeenCalled();
      expect(document.cookie).not.toContain('registered-token');
    });

    it('registers under the shared Web Lock used by login and refresh', async () => {
      const lockNames: string[] = [];
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: {
          request: async (name: string, callback: () => Promise<unknown>) => {
            lockNames.push(name);
            return callback();
          },
        },
      });
      fetchMock.mockResolvedValue(created());
      const { fill, submit } = setup();
      await fill();

      await submit();

      await waitFor(() => expect(replaceMock).toHaveBeenCalled());
      expect(lockNames).toEqual(['nimbus-auth-refresh']);
      delete (navigator as { locks?: unknown }).locks;
    });

    it('prevents a double submit while the request is running', async () => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValue(pending.promise);
      const { user, fill, submit } = setup();
      await fill();

      await submit();
      const button = screen.getByRole('button', { name: /Account aanmaken/ });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      await user.click(button);
      await user.keyboard('{Enter}');

      expect(registerCalls()).toHaveLength(1);
      pending.resolve(created());
      await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    });
  });

  describe('errors', () => {
    it('shows the e-mail conflict on the field and keeps all entered values (409)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { error: { code: 'EMAIL_ALREADY_EXISTS' } }));
      const { fill, submit, fields } = setup();
      await fill();

      await submit();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        REGISTER_ERROR_MESSAGES.email_exists,
      );
      expect(screen.getByText(M.emailTaken)).toBeInTheDocument();
      expect(fields.email).toHaveAttribute('aria-invalid', 'true');
      expect(fields.email).toHaveFocus();
      expect(fields.firstName).toHaveValue('  John ');
      expect(fields.password).toHaveValue(PASSWORD);
      expect(fields.passwordConfirmation).toHaveValue(PASSWORD);
      expect(getAccessToken()).toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('marks the fields rejected by the backend (422)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(422, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'x',
            details: [{ field: 'password', message: 'Password must contain a digit (0-9).' }],
          },
        }),
      );
      const { fill, submit, fields } = setup();
      await fill();

      await submit();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        REGISTER_ERROR_MESSAGES.validation,
      );
      expect(screen.getByText(M.passwordComposition)).toBeInTheDocument();
      expect(fields.password).toHaveFocus();
    });

    it('maps the real backend 422 response for several fields to the form fields', async () => {
      // Shape returned by backend #12 for blank names, an invalid e-mail and a blank workspace.
      fetchMock.mockResolvedValue(
        jsonResponse(422, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The request contains invalid data.',
            details: [
              { field: 'first_name', message: 'String should have at least 1 character' },
              { field: 'last_name', message: 'String should have at least 1 character' },
              { field: 'email', message: 'value is not a valid email address' },
              { field: 'workspace_name', message: 'String should have at least 1 character' },
            ],
          },
          request_id: 'req_1',
        }),
      );
      const { fill, submit, fields } = setup();
      await fill();

      await submit();

      await screen.findByRole('alert');
      expect(fields.firstName).toHaveAttribute('aria-invalid', 'true');
      expect(fields.lastName).toHaveAttribute('aria-invalid', 'true');
      expect(fields.email).toHaveAttribute('aria-invalid', 'true');
      expect(fields.workspaceName).toHaveAttribute('aria-invalid', 'true');
      expect(fields.password).not.toHaveAttribute('aria-invalid');
      expect(fields.firstName).toHaveFocus();
    });

    it('shows only the general message for a 422 without field details', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(422, {
          error: {
            code: 'VALIDATION_ERROR',
            details: [{ field: '0', message: 'JSON decode error' }],
          },
        }),
      );
      const { fill, submit, fields } = setup();
      await fill();

      await submit();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        REGISTER_ERROR_MESSAGES.validation,
      );
      expect(fields.email).not.toHaveAttribute('aria-invalid');
    });

    it('recovers from an unexpected Web Lock rejection instead of staying blocked', async () => {
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: { request: () => Promise.reject(new Error('lock manager unavailable')) },
      });
      const { fill, submit } = setup();
      await fill();

      await submit();

      expect(await screen.findByRole('alert')).toHaveTextContent(REGISTER_ERROR_MESSAGES.server);
      expect(screen.getByRole('button', { name: 'Account aanmaken' })).toBeEnabled();
      expect(getAccessToken()).toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();

      // A new attempt works once the lock is available again.
      delete (navigator as { locks?: unknown }).locks;
      fetchMock.mockResolvedValue(created());
      await submit();
      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    });

    it.each([
      [429, REGISTER_ERROR_MESSAGES.rate_limited],
      [500, REGISTER_ERROR_MESSAGES.server],
    ])('shows a Dutch message for status %i', async (status, message) => {
      fetchMock.mockResolvedValue(jsonResponse(status, { error: { code: 'X' } }));
      const { fill, submit } = setup();
      await fill();

      await submit();

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(getAccessToken()).toBeNull();
    });

    it('shows a network error and allows a new attempt', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      fetchMock.mockResolvedValueOnce(created());
      const { fill, submit } = setup();
      await fill();

      await submit();
      expect(await screen.findByRole('alert')).toHaveTextContent(REGISTER_ERROR_MESSAGES.network);
      expect(screen.getByRole('button', { name: 'Account aanmaken' })).toBeEnabled();

      await submit();
      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
      expect(registerCalls()).toHaveLength(2);
    });

    it('never writes the password to browser storage or the console', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const logs = [
        vi.spyOn(console, 'log'),
        vi.spyOn(console, 'error'),
        vi.spyOn(console, 'warn'),
      ];
      const { fill, submit } = setup();
      await fill();

      await submit();
      await screen.findByRole('alert');

      expect(setItem).not.toHaveBeenCalled();
      for (const spy of logs) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD);
      }
    });
  });
});
