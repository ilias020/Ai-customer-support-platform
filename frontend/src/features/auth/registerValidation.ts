import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  unmetPasswordRequirements,
} from './passwordPolicy';

export type RegisterFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  workspaceName: string;
  password: string;
  passwordConfirmation: string;
};

export type RegisterField = keyof RegisterFormValues;
export type RegisterFieldErrors = Partial<Record<RegisterField, string>>;

export const NAME_MAX_LENGTH = 100;
export const WORKSPACE_NAME_MAX_LENGTH = 150;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const REGISTER_VALIDATION_MESSAGES = {
  firstNameRequired: 'Vul je voornaam in.',
  lastNameRequired: 'Vul je achternaam in.',
  nameTooLong: `Gebruik maximaal ${NAME_MAX_LENGTH} tekens.`,
  emailRequired: 'Vul je e-mailadres in.',
  emailInvalid: 'Voer een geldig e-mailadres in.',
  emailTaken: 'Dit e-mailadres is al in gebruik.',
  workspaceNameRequired: 'Vul de naam van je bedrijf of workspace in.',
  workspaceNameTooLong: `Gebruik maximaal ${WORKSPACE_NAME_MAX_LENGTH} tekens.`,
  passwordRequired: 'Kies een wachtwoord.',
  passwordTooShort: `Gebruik minimaal ${PASSWORD_MIN_LENGTH} tekens.`,
  passwordTooLong: `Gebruik maximaal ${PASSWORD_MAX_LENGTH} tekens.`,
  passwordComposition:
    'Gebruik minimaal één hoofdletter, één kleine letter, één cijfer en één speciaal teken.',
  passwordConfirmationRequired: 'Herhaal je wachtwoord.',
  passwordMismatch: 'De wachtwoorden komen niet overeen.',
} as const;

function passwordError(password: string): string | undefined {
  if (password.length === 0) return REGISTER_VALIDATION_MESSAGES.passwordRequired;

  const unmet = unmetPasswordRequirements(password);
  if (unmet.includes('minLength')) return REGISTER_VALIDATION_MESSAGES.passwordTooShort;
  if (unmet.includes('maxLength')) return REGISTER_VALIDATION_MESSAGES.passwordTooLong;
  if (unmet.length > 0) return REGISTER_VALIDATION_MESSAGES.passwordComposition;
  return undefined;
}

/** Client-side validation for a quick response; the backend remains leading. */
export function validateRegisterForm(values: RegisterFormValues): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const email = values.email.trim();
  const workspaceName = values.workspaceName.trim();

  if (!firstName) errors.firstName = REGISTER_VALIDATION_MESSAGES.firstNameRequired;
  else if (firstName.length > NAME_MAX_LENGTH)
    errors.firstName = REGISTER_VALIDATION_MESSAGES.nameTooLong;

  if (!lastName) errors.lastName = REGISTER_VALIDATION_MESSAGES.lastNameRequired;
  else if (lastName.length > NAME_MAX_LENGTH)
    errors.lastName = REGISTER_VALIDATION_MESSAGES.nameTooLong;

  if (!email) errors.email = REGISTER_VALIDATION_MESSAGES.emailRequired;
  else if (!EMAIL_PATTERN.test(email)) errors.email = REGISTER_VALIDATION_MESSAGES.emailInvalid;

  if (!workspaceName) errors.workspaceName = REGISTER_VALIDATION_MESSAGES.workspaceNameRequired;
  else if (workspaceName.length > WORKSPACE_NAME_MAX_LENGTH) {
    errors.workspaceName = REGISTER_VALIDATION_MESSAGES.workspaceNameTooLong;
  }

  // The password is validated exactly as entered: never trimmed or normalized.
  const passwordMessage = passwordError(values.password);
  if (passwordMessage) errors.password = passwordMessage;

  if (values.passwordConfirmation.length === 0) {
    errors.passwordConfirmation = REGISTER_VALIDATION_MESSAGES.passwordConfirmationRequired;
  } else if (values.passwordConfirmation !== values.password) {
    errors.passwordConfirmation = REGISTER_VALIDATION_MESSAGES.passwordMismatch;
  }

  return errors;
}
