/**
 * In-memory access token holder.
 *
 * The access token is intentionally never persisted (no localStorage, sessionStorage or
 * JavaScript-readable cookies). It is lost on a full page reload; restoring a session via the
 * HttpOnly refresh-token cookie is the responsibility of a separate story.
 */
let accessToken: string | null = null;

/**
 * Incremented when the session is cleared or a new session starts (login), so responses that
 * belong to an earlier session can be recognized. A token refresh keeps the version.
 */
let sessionVersion = 0;

/** Stores a renewed access token of the current session (e.g. after a refresh). */
export function setAccessToken(token: string): void {
  accessToken = token;
}

/**
 * Stores the access token of a newly authenticated session (login). Starting a new session
 * invalidates pending requests of a previous session, which may belong to another user.
 */
export function startSession(token: string): void {
  accessToken = token;
  sessionVersion += 1;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
  sessionVersion += 1;
}

export function getSessionVersion(): number {
  return sessionVersion;
}
