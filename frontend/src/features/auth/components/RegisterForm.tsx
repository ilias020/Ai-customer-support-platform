'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, type RefObject, useRef, useState } from 'react';
import { Alert, Button, Logo, TextField } from '../../../components/ui';
import {
  register,
  type RegisterErrorKind,
  type RegisterPayload,
  type RegisterResult,
} from '../api/register';
import { REGISTER_ERROR_MESSAGES } from '../messages';
import { DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE } from '../navigation';
import { markRegistrationCompleted } from '../registrationNotice';
import {
  REGISTER_VALIDATION_MESSAGES,
  type RegisterField,
  type RegisterFieldErrors,
  type RegisterFormValues,
  validateRegisterForm,
} from '../registerValidation';
import { startSession } from '../session/accessToken';
import { runExclusiveAcrossTabs } from '../session/refreshSession';
import { EyeIcon } from './EyeIcon';
import { PasswordRequirements } from './PasswordRequirements';

export const POST_REGISTER_REDIRECT = DEFAULT_AUTHENTICATED_ROUTE;

const FIELD_ORDER: RegisterField[] = [
  'firstName',
  'lastName',
  'email',
  'workspaceName',
  'password',
  'passwordConfirmation',
];

const API_FIELD_TO_FORM_FIELD: Record<keyof RegisterPayload, RegisterField> = {
  first_name: 'firstName',
  last_name: 'lastName',
  email: 'email',
  workspace_name: 'workspaceName',
  password: 'password',
};

const BACKEND_FIELD_MESSAGES: Record<RegisterField, string> = {
  firstName: REGISTER_VALIDATION_MESSAGES.firstNameRequired,
  lastName: REGISTER_VALIDATION_MESSAGES.lastNameRequired,
  email: REGISTER_VALIDATION_MESSAGES.emailInvalid,
  workspaceName: REGISTER_VALIDATION_MESSAGES.workspaceNameRequired,
  password: REGISTER_VALIDATION_MESSAGES.passwordComposition,
  passwordConfirmation: REGISTER_VALIDATION_MESSAGES.passwordMismatch,
};

const EMPTY_VALUES: RegisterFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  workspaceName: '',
  password: '',
  passwordConfirmation: '',
};

function PasswordToggle({
  visible,
  onToggle,
  controls,
}: {
  visible: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
      aria-controls={controls}
      className="flex h-full items-center rounded-r-lg px-3 text-neutral-400 hover:text-secondary-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500"
    >
      <EyeIcon crossed={visible} />
    </button>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState<RegisterFormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [formError, setFormError] = useState<RegisterErrorKind | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  // The requirements appear once the user starts typing and stay visible afterwards, so the
  // layout does not collapse again when the field is cleared.
  const [passwordTouched, setPasswordTouched] = useState(false);
  const submittingRef = useRef(false);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const workspaceNameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmationRef = useRef<HTMLInputElement>(null);

  function focusFirstError(errors: RegisterFieldErrors) {
    const refs: Record<RegisterField, RefObject<HTMLInputElement | null>> = {
      firstName: firstNameRef,
      lastName: lastNameRef,
      email: emailRef,
      workspaceName: workspaceNameRef,
      password: passwordRef,
      passwordConfirmation: passwordConfirmationRef,
    };
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (first) refs[first].current?.focus();
  }

  function updateField(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const errors = validateRegisterForm(values);
    setFieldErrors(errors);
    setFormError(null);

    if (Object.values(errors).some(Boolean)) {
      focusFirstError(errors);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    let result: RegisterResult;

    try {
      // Same lock as login and token refresh: the refresh cookie set by this response can never be
      // overwritten by a refresh of a previous session that is still running.
      result = await runExclusiveAcrossTabs(async () => {
        const registerResult = await register({
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          email: values.email.trim(),
          // The password is sent exactly as entered; the confirmation is never sent.
          password: values.password,
          workspace_name: values.workspaceName.trim(),
        });
        if (registerResult.ok) {
          startSession(registerResult.accessToken);
        }
        return registerResult;
      });
    } catch {
      // `register()` itself never throws; this covers an unexpected rejection of the Web Lock.
      result = { ok: false, error: 'server' };
    }

    if (result.ok) {
      // The form stays disabled while the dashboard loads, so it cannot be submitted again.
      markRegistrationCompleted();
      router.replace(POST_REGISTER_REDIRECT);
      return;
    }

    // Entered values stay in the form (in memory only) so the user can correct them.
    if (result.error === 'email_exists') {
      const emailError = { email: REGISTER_VALIDATION_MESSAGES.emailTaken };
      setFieldErrors(emailError);
      focusFirstError(emailError);
    } else if (result.error === 'validation' && result.invalidFields?.length) {
      const backendErrors: RegisterFieldErrors = {};
      for (const apiField of result.invalidFields) {
        const field = API_FIELD_TO_FORM_FIELD[apiField];
        backendErrors[field] = BACKEND_FIELD_MESSAGES[field];
      }
      setFieldErrors(backendErrors);
      focusFirstError(backendErrors);
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
          Maak je account aan
        </h1>
        <p className="text-[13px] leading-[19px] text-secondary-500 md:text-sm md:leading-[22px]">
          Start met jouw AI Customer Support Platform. Je workspace wordt direct aangemaakt.
        </p>
      </div>

      <form
        noValidate
        aria-busy={isSubmitting || undefined}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 md:gap-[18px] xl:gap-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-3">
          <TextField
            ref={firstNameRef}
            id="first_name"
            name="first_name"
            label="Voornaam"
            placeholder="Vul je voornaam in"
            autoComplete="given-name"
            required
            value={values.firstName}
            error={fieldErrors.firstName}
            onChange={(event) => updateField('firstName', event.target.value)}
          />
          <TextField
            ref={lastNameRef}
            id="last_name"
            name="last_name"
            label="Achternaam"
            placeholder="Vul je achternaam in"
            autoComplete="family-name"
            required
            value={values.lastName}
            error={fieldErrors.lastName}
            onChange={(event) => updateField('lastName', event.target.value)}
          />
        </div>

        <TextField
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          label="E-mailadres"
          placeholder="naam@bedrijf.nl"
          autoComplete="email"
          inputMode="email"
          required
          value={values.email}
          error={fieldErrors.email}
          onChange={(event) => updateField('email', event.target.value)}
        />

        <TextField
          ref={workspaceNameRef}
          id="workspace_name"
          name="workspace_name"
          label="Bedrijfsnaam"
          placeholder="Vul je bedrijfsnaam in"
          autoComplete="organization"
          required
          value={values.workspaceName}
          error={fieldErrors.workspaceName}
          onChange={(event) => updateField('workspaceName', event.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <TextField
            ref={passwordRef}
            id="password"
            name="password"
            type={passwordVisible ? 'text' : 'password'}
            label="Wachtwoord"
            placeholder="••••••••••••"
            autoComplete="new-password"
            required
            aria-describedby={
              [
                fieldErrors.password ? 'password-error' : '',
                passwordTouched ? 'password-requirements' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
            value={values.password}
            error={fieldErrors.password}
            onChange={(event) => {
              setPasswordTouched(true);
              updateField('password', event.target.value);
            }}
            endAdornment={
              <PasswordToggle
                visible={passwordVisible}
                onToggle={() => setPasswordVisible((visible) => !visible)}
                controls="password"
              />
            }
          />
          {passwordTouched ? (
            <PasswordRequirements id="password-requirements" password={values.password} />
          ) : null}
        </div>

        <TextField
          ref={passwordConfirmationRef}
          id="password_confirmation"
          label="Herhaal wachtwoord"
          type={confirmationVisible ? 'text' : 'password'}
          placeholder="••••••••••••"
          autoComplete="new-password"
          required
          value={values.passwordConfirmation}
          error={fieldErrors.passwordConfirmation}
          onChange={(event) => updateField('passwordConfirmation', event.target.value)}
          endAdornment={
            <PasswordToggle
              visible={confirmationVisible}
              onToggle={() => setConfirmationVisible((visible) => !visible)}
              controls="password_confirmation"
            />
          }
        />

        {formError ? (
          <Alert variant={formError === 'rate_limited' ? 'warning' : 'error'}>
            {REGISTER_ERROR_MESSAGES[formError]}
          </Alert>
        ) : null}

        <Button type="submit" loading={isSubmitting} loadingText="Account aanmaken…">
          Account aanmaken
        </Button>
      </form>

      <p className="text-center text-xs leading-4 text-secondary-500 md:text-[13px] md:leading-[17px]">
        Heb je al een account?{' '}
        <Link
          href={LOGIN_ROUTE}
          className="rounded-sm font-semibold text-primary-500 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          Inloggen
        </Link>
      </p>
    </div>
  );
}
