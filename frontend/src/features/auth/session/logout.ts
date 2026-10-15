import { type LogoutOutcome, requestLogout } from '../api/logout';
import { type LogoutNoticeKind, markLogoutNotice } from '../logoutNotice';
import { redirectToLogin } from '../navigation';
import { clearAccessToken } from './accessToken';
import { runExclusiveAcrossTabs } from './refreshSession';
import { broadcastSessionEnded } from './sessionBroadcast';

/** `unexpected`: the logout could not be started (e.g. the Web Lock failed); nothing changed. */
export type LogoutResult = LogoutOutcome | 'unexpected';

function endLocalSession(notice: LogoutNoticeKind): void {
  // Invalidates the in-memory token and every pending response of this session first.
  clearAccessToken();
  broadcastSessionEnded();
  markLogoutNotice(notice);
  // A full page navigation discards all in-memory state of the protected pages, including the
  // current user and requests that are still pending. No return path: the user chose to leave.
  redirectToLogin();
}

/**
 * Ends the current session (Issue #13).
 * The request runs under the same Web Lock as login and token refresh, in every tab. A refresh
 * that is still running finishes first, so the logout always sends the newest refresh cookie;
 * a refresh queued behind the logout finds the session revoked and its cookie removed.
 * - `ok` (204) and `unauthenticated` (401): the session no longer exists on the server; the local
 *   state is cleared and the browser navigates to the login page. Only `ok` leads to the success
 *   message.
 * - `server`, `network` and `unexpected`: the outcome is unknown, so the session is kept and the
 *   caller can let the user try again.
 */
export async function logout(): Promise<LogoutResult> {
  try {
    return await runExclusiveAcrossTabs(async () => {
      const outcome = await requestLogout();

      if (outcome === 'ok') {
        endLocalSession('logged_out');
      } else if (outcome === 'unauthenticated') {
        endLocalSession('session_ended');
      }

      return outcome;
    });
  } catch {
    return 'unexpected';
  }
}
