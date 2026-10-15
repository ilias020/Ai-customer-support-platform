/**
 * One-time notice for the login page after a logout.
 * Logout ends with a full page navigation to `/login`, which discards all in-memory state of the
 * protected pages. The notice therefore survives in `sessionStorage` (this tab only). It holds
 * nothing but the outcome below: no token, user or session data. It is removed as soon as it is
 * read, so a reload of the login page does not show it again.
 */
export type LogoutNoticeKind = 'logged_out' | 'session_ended';

export const LOGOUT_NOTICE_STORAGE_KEY = 'nimbus.logout-notice';

function isLogoutNoticeKind(value: unknown): value is LogoutNoticeKind {
  return value === 'logged_out' || value === 'session_ended';
}

export function markLogoutNotice(kind: LogoutNoticeKind): void {
  try {
    window.sessionStorage.setItem(LOGOUT_NOTICE_STORAGE_KEY, kind);
  } catch {
    // Storage can be unavailable (private mode, blocked storage): the logout itself still counts.
  }
}

/** Returns the pending notice once and removes it. */
export function takeLogoutNotice(): LogoutNoticeKind | null {
  try {
    const value = window.sessionStorage.getItem(LOGOUT_NOTICE_STORAGE_KEY);
    window.sessionStorage.removeItem(LOGOUT_NOTICE_STORAGE_KEY);
    return isLogoutNoticeKind(value) ? value : null;
  } catch {
    return null;
  }
}
