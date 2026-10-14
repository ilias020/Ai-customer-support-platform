import { describe, expect, it } from 'vitest';
import {
  REGISTER_VALIDATION_MESSAGES as M,
  type RegisterFormValues,
  validateRegisterForm,
} from './registerValidation';

const VALID: RegisterFormValues = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  workspaceName: 'Example Company',
  password: 'Correct-Horse-9',
  passwordConfirmation: 'Correct-Horse-9',
};

describe('validateRegisterForm', () => {
  it('accepts valid values', () => {
    expect(validateRegisterForm(VALID)).toEqual({});
  });

  it('requires all fields', () => {
    expect(
      validateRegisterForm({
        firstName: ' ',
        lastName: '',
        email: '  ',
        workspaceName: '',
        password: '',
        passwordConfirmation: '',
      }),
    ).toEqual({
      firstName: M.firstNameRequired,
      lastName: M.lastNameRequired,
      email: M.emailRequired,
      workspaceName: M.workspaceNameRequired,
      password: M.passwordRequired,
      passwordConfirmation: M.passwordConfirmationRequired,
    });
  });

  it('applies the maximum lengths after trimming', () => {
    expect(validateRegisterForm({ ...VALID, firstName: ` ${'x'.repeat(100)} ` })).toEqual({});
    expect(validateRegisterForm({ ...VALID, lastName: 'x'.repeat(101) }).lastName).toBe(
      M.nameTooLong,
    );
    expect(validateRegisterForm({ ...VALID, workspaceName: 'x'.repeat(150) })).toEqual({});
    expect(validateRegisterForm({ ...VALID, workspaceName: 'x'.repeat(151) }).workspaceName).toBe(
      M.workspaceNameTooLong,
    );
  });

  it('validates the e-mail format after trimming', () => {
    expect(validateRegisterForm({ ...VALID, email: '  John@Example.com ' })).toEqual({});
    expect(validateRegisterForm({ ...VALID, email: 'not-an-email' }).email).toBe(M.emailInvalid);
  });

  it.each([
    ['Abcdefgh1!x', M.passwordTooShort],
    ['Aa1!' + 'x'.repeat(125), M.passwordTooLong],
    ['abcdefghij1!', M.passwordComposition],
    ['Abcdefghijk1', M.passwordComposition],
  ])('rejects password %s', (password, message) => {
    expect(
      validateRegisterForm({ ...VALID, password, passwordConfirmation: password }).password,
    ).toBe(message);
  });

  it('requires the confirmation to match exactly', () => {
    expect(
      validateRegisterForm({ ...VALID, passwordConfirmation: 'Correct-Horse-8' })
        .passwordConfirmation,
    ).toBe(M.passwordMismatch);
    // No trimming: a trailing space makes the confirmation different.
    expect(
      validateRegisterForm({ ...VALID, passwordConfirmation: 'Correct-Horse-9 ' })
        .passwordConfirmation,
    ).toBe(M.passwordMismatch);
  });
});
