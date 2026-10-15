import type { ReactNode } from 'react';

type SnackbarVariant = 'success' | 'info';

const variantClasses: Record<SnackbarVariant, { border: string; icon: string; symbol: string }> = {
  success: { border: 'border-success-500', icon: 'text-success-500', symbol: '✓' },
  info: { border: 'border-primary-500', icon: 'text-primary-500', symbol: 'i' },
};

type SnackbarPosition = 'top' | 'bottom';

const positionClasses: Record<SnackbarPosition, string> = {
  // Below the top edge (and a notch or status bar on mobile), horizontally centered.
  top: 'top-[max(1rem,env(safe-area-inset-top))] md:top-6',
  bottom: 'bottom-4 md:bottom-6',
};

type SnackbarProps = {
  variant?: SnackbarVariant;
  /** Defaults to `bottom`. */
  position?: SnackbarPosition;
  children: ReactNode;
  onDismiss: () => void;
};

/**
 * Short, non-blocking feedback at the top or bottom of the screen, horizontally centered. It does
 * not cover the page content beyond its own size and can be dismissed. Render it inside an `aria-live`
 * region that already exists on the page, so screen readers announce it when it appears.
 */
export function Snackbar({
  variant = 'success',
  position = 'bottom',
  children,
  onDismiss,
}: SnackbarProps) {
  const styles = variantClasses[variant];

  return (
    <div
      className={`pointer-events-none fixed inset-x-4 z-50 flex justify-center ${positionClasses[position]}`}
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border bg-surface px-4 py-3 text-[13px] leading-[1.5] text-secondary-900 shadow-lg ${styles.border}`}
      >
        <span aria-hidden="true" className={`font-semibold ${styles.icon}`}>
          {styles.symbol}
        </span>
        <p className="flex-1">{children}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Melding sluiten"
          className="rounded-sm px-1 text-neutral-400 hover:text-secondary-700 focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          ×
        </button>
      </div>
    </div>
  );
}
