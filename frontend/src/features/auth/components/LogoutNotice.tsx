'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Snackbar } from '../../../components/ui';
import { type LogoutNoticeKind, takeLogoutNotice } from '../logoutNotice';
import { LOGOUT_NOTICE_MESSAGES } from '../messages';

/*
 * The pending notice is read from storage once per page load and kept here, so every render of
 * this page load sees the same value (as `useSyncExternalStore` requires) and a reload shows
 * nothing, because `takeLogoutNotice()` already removed it.
 */
let notice: LogoutNoticeKind | null | undefined;
let mountedNotices = 0;
const listeners = new Set<() => void>();

function getSnapshot(): LogoutNoticeKind | null {
  if (notice === undefined) {
    notice = takeLogoutNotice();
  }
  return notice;
}

function getServerSnapshot(): null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismiss(): void {
  notice = null;
  listeners.forEach((listener) => listener());
}

/** Test helper: forgets the notice that was read for the current page load. */
export function resetLogoutNoticeForTests(): void {
  notice = undefined;
}

/**
 * One-time, non-blocking feedback on the login page after a logout (Issue #13).
 *
 * The success message only appears after the backend confirmed the logout with `204`. After a
 * `401` (the session had already ended) a neutral message is shown instead. The live region is
 * always rendered, so screen readers announce the message when it is filled in after hydration.
 */
export function LogoutNotice() {
  const kind = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    mountedNotices += 1;
    return () => {
      mountedNotices -= 1;
      // Shown once: leaving the login page (e.g. to register) and coming back shows nothing.
      // Deferred, so the immediate remount of React Strict Mode keeps the notice.
      setTimeout(() => {
        if (mountedNotices === 0) {
          notice = null;
        }
      }, 0);
    };
  }, []);

  return (
    // On mobile the region is moved to the top of the login page flow (see `mobileLayout`).
    <div role="status" aria-live="polite" className="order-first md:order-none">
      {kind ? (
        <Snackbar
          variant={kind === 'logged_out' ? 'success' : 'info'}
          position="top"
          mobileLayout="inline"
          onDismiss={dismiss}
        >
          {LOGOUT_NOTICE_MESSAGES[kind]}
        </Snackbar>
      ) : null}
    </div>
  );
}
