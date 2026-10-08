export const LOGIN_ROUTE = '/login';

/**
 * Sends the user to the login page with a full page navigation, which also discards all
 * in-memory authentication state of the current page.
 */
export function redirectToLogin(): void {
  window.location.replace(LOGIN_ROUTE);
}
