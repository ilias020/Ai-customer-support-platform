/**
 * In-memory access token holder.
 *
 * The access token is intentionally never persisted (no localStorage, sessionStorage or
 * JavaScript-readable cookies). It is lost on a full page reload; restoring a session via the
 * HttpOnly refresh-token cookie is the responsibility of a separate story.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}
