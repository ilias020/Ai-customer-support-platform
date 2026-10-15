'use client';

import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../../components/ui';
import { LOGOUT_DIALOG_TEXT, LOGOUT_ERROR_MESSAGES } from '../messages';
import { logout, type LogoutResult } from '../session/logout';
import { LogoutIcon } from './LogoutIcon';

type LogoutError = keyof typeof LOGOUT_ERROR_MESSAGES;

/**
 * "Uitloggen" action with a confirmation dialog (Issue #13). Only meant for protected pages.
 * Styled after the "Uitloggen" item of the Design System user menu, so it can move into the
 * future navigation unchanged.
 * Cancelling sends nothing. Confirming sends exactly one logout request; while it runs the
 * dialog cannot be closed or confirmed again. On success the browser navigates to the login
 * page (see `logout()`); on an unknown outcome an error is shown and the user stays logged in.
 */
export function LogoutButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LogoutError | null>(null);
  // Synchronous guard against double clicks before React re-renders the disabled button.
  const pendingRef = useRef(false);

  function openDialog() {
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    if (pendingRef.current) {
      return;
    }
    setOpen(false);
    setError(null);
  }

  async function confirmLogout() {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(null);

    let result: LogoutResult;

    try {
      result = await logout();
    } catch {
      // `logout()` reports its own failures; this only guards against an unexpected rejection,
      // so the dialog can never stay blocked.
      result = 'unexpected';
    }

    if (result === 'ok' || result === 'unauthenticated') {
      // The browser is navigating to the login page; keep the dialog busy until it unloads.
      return;
    }

    pendingRef.current = false;
    setPending(false);
    setError(result);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className="group inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm leading-[1.2] font-medium text-error-500 shadow-[0_1px_2px_rgb(36_43_53_/_0.06)] transition-colors duration-150 ease-out hover:border-error-300 hover:bg-error-100 hover:text-error-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 active:bg-error-100"
      >
        <LogoutIcon className="size-[18px]" />
        Uitloggen
      </button>

      <ConfirmDialog
        open={open}
        title={LOGOUT_DIALOG_TEXT.title}
        description={LOGOUT_DIALOG_TEXT.description}
        cancelLabel={LOGOUT_DIALOG_TEXT.cancel}
        confirmLabel={LOGOUT_DIALOG_TEXT.confirm}
        confirmingLabel={LOGOUT_DIALOG_TEXT.confirming}
        icon={<LogoutIcon className="size-6" />}
        // Design System: "Uitloggen" is shown in the error color in the user menu and confirmed
        // like other actions that end something (confirmation modal, destructive button).
        tone="destructive"
        busy={pending}
        error={error ? LOGOUT_ERROR_MESSAGES[error] : undefined}
        onCancel={closeDialog}
        onConfirm={() => void confirmLogout()}
      />
    </>
  );
}
