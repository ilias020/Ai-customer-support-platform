import { describe, expect, it } from 'vitest';

import { LOGIN_VALIDATION_MESSAGES, validateLoginForm } from './validation';

describe('validateLoginForm', () => {
  it('accepts a valid email address and password', () => {
    expect(validateLoginForm({ email: 'user@example.com', password: 'secret' })).toEqual({});
  });

  it('requires an email address', () => {
    expect(validateLoginForm({ email: '   ', password: 'secret' }).email).toBe(
      LOGIN_VALIDATION_MESSAGES.emailRequired,
    );
  });

  it.each(['test', 'test@', '@example.com', 'user@example', 'us er@example.com'])(
    'rejects invalid email format %s',
    (email) => {
      expect(validateLoginForm({ email, password: 'secret' }).email).toBe(
        LOGIN_VALIDATION_MESSAGES.emailInvalid,
      );
    },
  );

  it('ignores surrounding whitespace in the email address', () => {
    expect(validateLoginForm({ email: '  user@example.com ', password: 'secret' })).toEqual({});
  });

  it('requires a password', () => {
    expect(validateLoginForm({ email: 'user@example.com', password: '' }).password).toBe(
      LOGIN_VALIDATION_MESSAGES.passwordRequired,
    );
  });

  it('does not trim the password', () => {
    expect(validateLoginForm({ email: 'user@example.com', password: '   ' })).toEqual({});
  });
});
