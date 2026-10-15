import type { LoginErrorKind } from './api/login';
import type { RegisterErrorKind } from './api/register';

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorKind, string> = {
  invalid_credentials: 'Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord.',
  validation: 'Controleer de ingevulde gegevens en probeer het opnieuw.',
  rate_limited: 'Te veel inlogpogingen. Probeer het over een minuut opnieuw.',
  server: 'Er is iets misgegaan. Probeer het later opnieuw.',
  network: 'De loginservice is tijdelijk niet bereikbaar. Probeer het later opnieuw.',
};

export const SESSION_GUARD_MESSAGES = {
  checking: 'Sessie controleren…',
  redirecting: 'Je wordt doorgestuurd naar de inlogpagina…',
  error:
    'Je sessie kon niet worden gecontroleerd. Controleer je verbinding en probeer het opnieuw.',
} as const;

export const REGISTER_ERROR_MESSAGES: Record<RegisterErrorKind, string> = {
  email_exists:
    'Er bestaat al een account met dit e-mailadres. Log in of gebruik een ander e-mailadres.',
  validation: 'Controleer de ingevulde gegevens en probeer het opnieuw.',
  rate_limited: 'Te veel registratiepogingen. Probeer het over een minuut opnieuw.',
  server: 'Er is iets misgegaan. Probeer het later opnieuw.',
  network:
    'De registratieservice is tijdelijk niet bereikbaar. Controleer je verbinding en probeer het opnieuw.',
};

export function registrationWelcomeMessage(firstName: string): string {
  return `Welkom bij Nimbus, ${firstName}! Je account en workspace zijn aangemaakt.`;
}

export const LOGOUT_DIALOG_TEXT = {
  title: 'Uitloggen bij Nimbus?',
  description: 'Weet je zeker dat je wilt uitloggen? Je kunt op ieder moment opnieuw inloggen.',
  cancel: 'Annuleren',
  confirm: 'Uitloggen',
  confirming: 'Uitloggen…',
} as const;

/**
 * Errors where it is unknown whether the server ended the session. The user stays logged in on
 * this device and can try again.
 */
export const LOGOUT_ERROR_MESSAGES = {
  server: 'Uitloggen is niet gelukt door een fout bij de server. Probeer het opnieuw.',
  network: 'Uitloggen is niet gelukt. Controleer je internetverbinding en probeer het opnieuw.',
  unexpected: 'Uitloggen is niet gelukt. Probeer het opnieuw.',
} as const;

export const LOGOUT_NOTICE_MESSAGES = {
  logged_out: 'Je bent succesvol uitgelogd.',
  session_ended: 'Je sessie was al beëindigd. Log opnieuw in om verder te gaan.',
} as const;
