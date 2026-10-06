import type { ReactNode } from 'react';

type AlertVariant = 'error' | 'warning';

const variantClasses: Record<AlertVariant, string> = {
  error: 'border-error-300 bg-error-100 text-error-700',
  warning: 'border-warning-300 bg-warning-100 text-warning-700',
};

type AlertProps = {
  variant?: AlertVariant;
  children: ReactNode;
};

export function Alert({ variant = 'error', children }: AlertProps) {
  return (
    <div
      role="alert"
      className={`w-full rounded-lg border px-3 py-2.5 text-[13px] leading-[1.5] ${variantClasses[variant]}`}
    >
      {children}
    </div>
  );
}
