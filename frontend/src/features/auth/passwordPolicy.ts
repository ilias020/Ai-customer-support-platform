/**
 * Nimbus Password Policy v1.0 — identical to the backend rules (Issue #12).
 * Lengths are counted in Unicode code points (like Python's `len`), not UTF-16 units, so an
 * emoji counts as one character. A special character is any character that is not a letter,
 * digit or whitespace. Passwords are never trimmed or normalized. The backend stays leading.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRequirement =
  'minLength' | 'maxLength' | 'uppercase' | 'lowercase' | 'digit' | 'special';

const SPECIAL_CHARACTER = /[^\p{L}\p{N}\s]/u;

export function passwordLength(password: string): number {
  return Array.from(password).length;
}

export function unmetPasswordRequirements(password: string): PasswordRequirement[] {
  const unmet: PasswordRequirement[] = [];
  const length = passwordLength(password);

  if (length < PASSWORD_MIN_LENGTH) unmet.push('minLength');
  if (length > PASSWORD_MAX_LENGTH) unmet.push('maxLength');
  if (!/[A-Z]/.test(password)) unmet.push('uppercase');
  if (!/[a-z]/.test(password)) unmet.push('lowercase');
  if (!/[0-9]/.test(password)) unmet.push('digit');
  if (!SPECIAL_CHARACTER.test(password)) unmet.push('special');

  return unmet;
}
