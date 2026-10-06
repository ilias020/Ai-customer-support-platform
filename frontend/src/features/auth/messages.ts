import type { LoginErrorKind } from './api/login';

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorKind, string> = {
  invalid_credentials: 'Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord.',
  validation: 'Controleer de ingevulde gegevens en probeer het opnieuw.',
  rate_limited: 'Te veel inlogpogingen. Probeer het over een minuut opnieuw.',
  server: 'Er is iets misgegaan. Probeer het later opnieuw.',
  network: 'De loginservice is tijdelijk niet bereikbaar. Probeer het later opnieuw.',
};
