'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs. */
  confirmingLabel: string;
  /** Optional decorative icon above the title (hidden from assistive technology). */
  icon?: ReactNode;
  /** `destructive` (Design System confirmation modal) for actions that end or remove something. */
  tone?: 'default' | 'destructive';
  /** While busy both buttons are disabled and the dialog cannot be closed. */
  busy?: boolean;
  error?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Modal confirmation dialog based on the native `<dialog>` element (`showModal()`).
 *
 * The browser provides the modal behaviour: the rest of the page is inert, focus stays inside the
 * dialog, Escape requests a cancel, and focus returns to the opening element when it closes.
 * Initial focus is on the cancel button, the safe choice. The dialog is open while `open` is true;
 * the parent closes it by setting `open` to false.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmingLabel,
  icon,
  tone = 'default',
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const latest = useRef({ open, busy, onCancel });
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    latest.current = { open, busy, onCancel };
  });

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      // Initial focus on the safe action, in every browser.
      dialog.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleNativeClose() {
    const { open: shouldBeOpen, busy: isBusy, onCancel: cancel } = latest.current;

    if (!shouldBeOpen) {
      // Closed by the parent.
      return;
    }

    if (isBusy) {
      // Chrome closes a dialog after repeated Escape presses without user activation, even when
      // the cancel event is prevented. While the action runs the dialog has to stay open.
      dialogRef.current?.showModal();
      return;
    }

    // Closed by the browser in another way: keep the parent state in sync.
    cancel();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Escape: the parent decides (and the dialog stays open while the action runs).
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }}
      onClose={handleNativeClose}
      className="m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-xl border border-border bg-surface p-6 text-secondary-900 shadow-[0_24px_48px_-12px_rgb(36_43_53_/_0.25)] backdrop:bg-secondary-900/40 backdrop:backdrop-blur-[2px] md:p-8 motion-safe:transition-[opacity,scale] motion-safe:duration-200 motion-safe:ease-out motion-safe:starting:scale-95 motion-safe:starting:opacity-0"
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={`mb-5 flex size-12 items-center justify-center rounded-full ring-8 ${
            tone === 'destructive'
              ? 'bg-error-100 text-error-500 ring-error-100/40'
              : 'bg-primary-100 text-primary-500 ring-primary-100/40'
          }`}
        >
          {icon}
        </div>
      ) : null}

      <h2
        id={titleId}
        className="text-lg leading-[1.3] font-semibold text-secondary-900 md:text-xl"
      >
        {title}
      </h2>
      <p id={descriptionId} className="mt-2 text-sm leading-[1.6] text-secondary-500">
        {description}
      </p>

      {error ? (
        <div className="mt-5">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
        <Button
          variant="outline"
          data-initial-focus
          onClick={onCancel}
          disabled={busy}
          className="sm:w-auto sm:min-w-28"
        >
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'destructive' ? 'destructive' : 'primary'}
          onClick={onConfirm}
          loading={busy}
          loadingText={confirmingLabel}
          className="sm:w-auto sm:min-w-28"
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
