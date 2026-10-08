export const LOGIN_ROUTE = '/login';

/** Default destination after login when no (safe) return path was requested. */
export const DEFAULT_AUTHENTICATED_ROUTE = '/dashboard';

/** Query parameter on the login page that holds the internal path to return to after login. */
export const RETURN_TO_PARAM = 'next';

const RETURN_PATH_MAX_LENGTH = 2048;
const PLACEHOLDER_ORIGIN = 'http://nimbus.invalid';

/**
 * Returns `value` only if it is a safe, internal, relative path; otherwise `null`.
 *
 * Rejects absolute and protocol-relative URLs (`https://…`, `//evil.example`), backslash tricks
 * (`/\evil.example`), control characters and the login page itself (to avoid redirect loops).
 */
export function sanitizeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > RETURN_PATH_MAX_LENGTH) {
    return null;
  }

  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== PLACEHOLDER_ORIGIN || url.pathname === LOGIN_ROUTE) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Login URL that returns to `returnTo` after a successful login, if that path is safe. */
export function buildLoginUrl(returnTo?: string | null): string {
  const safePath = sanitizeReturnPath(returnTo);

  if (!safePath) {
    return LOGIN_ROUTE;
  }

  return `${LOGIN_ROUTE}?${new URLSearchParams({ [RETURN_TO_PARAM]: safePath }).toString()}`;
}

/** Destination after login: the safe `next` path from `search`, or the default route. */
export function getPostLoginRedirect(search: string): string {
  const requested = new URLSearchParams(search).get(RETURN_TO_PARAM);

  return sanitizeReturnPath(requested) ?? DEFAULT_AUTHENTICATED_ROUTE;
}

/** Path, query and hash of the current page, e.g. `/dashboard?tab=open`. */
export function getCurrentPath(): string {
  const { pathname, search, hash } = window.location;

  return `${pathname}${search}${hash}`;
}

/**
 * Sends the user to the login page with a full page navigation, which also discards all
 * in-memory authentication state of the current page. An optional internal `returnTo` path is
 * passed along so the user can continue there after logging in.
 */
export function redirectToLogin(returnTo?: string): void {
  window.location.replace(buildLoginUrl(returnTo));
}
