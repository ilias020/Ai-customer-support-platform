'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

import { Alert, Button, Logo, TextField } from '../../../components/ui';
import { login, type LoginErrorKind } from '../api/login';
import { LOGIN_ERROR_MESSAGES } from '../messages';
import { DEFAULT_AUTHENTICATED_ROUTE, getPostLoginRedirect } from '../navigation';
import { setAccessToken } from '../session/accessToken';
import { type LoginFieldErrors, validateLoginForm } from '../validation';

export const POST_LOGIN_REDIRECT = DEFAULT_AUTHENTICATED_ROUTE;
const PASSWORD_MAX_LENGTH = 1024;

const trustItems = [
  { full: 'Privacygericht ontworpen', short: 'Privacy' },
  { full: 'Veilige sessies', short: 'Sessies' },
  { full: 'Beveiligde toegang', short: 'Beveiligd' },
];

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<LoginErrorKind | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const errors = validateLoginForm({ email, password });
    setFieldErrors(errors);
    setFormError(null);

    if (errors.email || errors.password) {
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    const result = await login({ email: email.trim(), password });

    if (result.ok) {
      setAccessToken(result.accessToken);
      // Returns to the protected page that was originally requested (`?next=`), if it is a safe
      // internal path; otherwise to the default route.
      router.replace(getPostLoginRedirect(window.location.search));
      return;
    }

    setFormError(result.error);
    submittingRef.current = false;
    setIsSubmitting(false);
  }

  return (
    <div className="flex w-full flex-col gap-5 md:gap-[22px] xl:gap-6">
      <Logo />

      <div className="flex flex-col gap-1.5 md:gap-2">
        <h1 className="text-2xl leading-[1.3] font-bold text-secondary-900 md:text-[28px] xl:text-[32px]">
          Welkom terug
        </h1>
        <p className="text-[13px] leading-[19px] text-secondary-500 md:text-sm md:leading-[22px]">
          Log in om toegang te krijgen tot jouw AI Customer Support Platform.
        </p>
      </div>

      <form
        noValidate
        aria-busy={isSubmitting || undefined}
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 md:gap-[22px] xl:gap-6"
      >
        <TextField
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          label="E-mailadres"
          placeholder="jij@bedrijf.nl"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          error={fieldErrors.email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
        />

        <TextField
          ref={passwordRef}
          id="password"
          name="password"
          type={passwordVisible ? 'text' : 'password'}
          label="Wachtwoord"
          placeholder="••••••••"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          required
          value={password}
          error={fieldErrors.password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          endAdornment={
            <button
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={passwordVisible ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
              aria-controls="password"
              className="flex h-full items-center rounded-r-lg px-3 text-neutral-400 hover:text-secondary-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500"
            >
              <EyeIcon crossed={passwordVisible} />
            </button>
          }
        />

        {/* Remember Me and password reset are separate stories: shown, but not interactive. */}
        <div className="flex items-center justify-between text-xs leading-4 md:text-[13px] md:leading-[17px]">
          <div className="flex items-center gap-[6px] md:gap-2">
            <input
              id="remember-me"
              type="checkbox"
              disabled
              className="size-4 cursor-not-allowed rounded border-border accent-primary-500 opacity-60"
            />
            <label htmlFor="remember-me" className="cursor-not-allowed text-neutral-400">
              Onthoud mij
            </label>
          </div>
          <span className="font-semibold text-neutral-400">Wachtwoord vergeten?</span>
        </div>

        {formError ? (
          <Alert variant={formError === 'rate_limited' ? 'warning' : 'error'}>
            {LOGIN_ERROR_MESSAGES[formError]}
          </Alert>
        ) : null}

        <Button type="submit" loading={isSubmitting}>
          Inloggen
        </Button>
      </form>

      <div aria-hidden="true" className="flex items-center gap-2.5 md:gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs leading-4 text-neutral-400">of</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Google login is a separate story: shown, but disabled. */}
      <Button variant="outline" disabled className="text-[13px] md:text-sm">
        <span aria-hidden="true" className="size-4 rounded-full bg-error-500" />
        Inloggen met Google
      </Button>

      {/* Registration is a separate story: shown as plain text, not as a link. */}
      <p className="text-center text-xs leading-4 text-secondary-500 md:text-[13px] md:leading-[17px]">
        Nog geen account?{' '}
        <span className="font-semibold text-neutral-400">Maak een account aan</span>
      </p>

      <ul className="flex flex-wrap items-center justify-center gap-3 text-[10px] leading-[13px] text-neutral-400 md:gap-4 md:text-[11px] md:leading-[14px]">
        {trustItems.map((item) => (
          <li key={item.full} className="flex items-center gap-[3px] md:gap-1">
            <span aria-hidden="true" className="text-success-500">
              ✓
            </span>
            <span className="md:hidden">{item.short}</span>
            <span className="hidden md:inline">{item.full}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
