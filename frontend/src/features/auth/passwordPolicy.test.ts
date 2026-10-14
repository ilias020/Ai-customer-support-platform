import { describe, expect, it } from 'vitest';
import { passwordLength, unmetPasswordRequirements } from './passwordPolicy';

describe('Nimbus Password Policy v1.0 (same cases as the backend tests)', () => {
  it.each([
    'Abcdefghij1!', // exactly 12 characters
    'Aa1!' + 'x'.repeat(124), // exactly 128 characters
    'Correct Horse 9 Battery!', // spaces are allowed
    'Correct-Horse-9',
    'Paßwort_2026x',
    'Wachtwoord€2026',
    'Wachtwoord😀2026',
    'Wacht"woord2026',
    'Wacht\\woord2026',
    'Wacht~woord2026',
    'Wacht.woord2026',
  ])('accepts %s', (password) => {
    expect(unmetPasswordRequirements(password)).toEqual([]);
  });

  it.each([
    ['Abcdefgh1!x', 'minLength'],
    ['Aa1!' + 'x'.repeat(125), 'maxLength'],
    ['abcdefghij1!', 'uppercase'],
    ['ABCDEFGHIJ1!', 'lowercase'],
    ['Abcdefghijk!', 'digit'],
    ['Abcdefghijk1', 'special'],
    ['Abcdef ghij1', 'special'], // a space is not a special character
    ['ÄBCDEFGHIJ1!', 'lowercase'], // only a-z counts as lowercase
  ])('rejects %s (%s)', (password, requirement) => {
    expect(unmetPasswordRequirements(password)).toContain(requirement);
  });

  it('lists all unmet requirements', () => {
    expect(unmetPasswordRequirements('abc')).toEqual([
      'minLength',
      'uppercase',
      'digit',
      'special',
    ]);
  });

  it('counts Unicode code points like the backend, not UTF-16 units', () => {
    const elevenPlusEmoji = 'Abcdefghi1😀'; // 11 code points, 12 UTF-16 units
    expect(elevenPlusEmoji.length).toBe(12);
    expect(passwordLength(elevenPlusEmoji)).toBe(11);
    expect(unmetPasswordRequirements(elevenPlusEmoji)).toContain('minLength');

    const maxWithEmoji = 'Aa1' + '😀'.repeat(125); // 128 code points, 253 UTF-16 units
    expect(unmetPasswordRequirements(maxWithEmoji)).toEqual([]);
  });

  it('does not trim or normalize the password', () => {
    expect(passwordLength('  Abcdefgh1!  ')).toBe(14);
    expect(unmetPasswordRequirements(' Abcdefgh1! ')).toEqual([]);
  });
});
