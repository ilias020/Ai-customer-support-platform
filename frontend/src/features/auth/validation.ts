export type LoginFormValues = {
  email: string;
  password: string;
};

export type LoginFieldErrors = Partial<Record<keyof LoginFormValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LOGIN_VALIDATION_MESSAGES = {
  emailRequired: 'Vul je e-mailadres in.',
  emailInvalid: 'Voer een geldig e-mailadres in.',
  passwordRequired: 'Vul je wachtwoord in.',
} as const;

export function validateLoginForm({ email, password }: LoginFormValues): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    errors.email = LOGIN_VALIDATION_MESSAGES.emailRequired;
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = LOGIN_VALIDATION_MESSAGES.emailInvalid;
  }

  // The password is never trimmed or otherwise modified.
  if (password.length === 0) {
    errors.password = LOGIN_VALIDATION_MESSAGES.passwordRequired;
  }

  return errors;
}
