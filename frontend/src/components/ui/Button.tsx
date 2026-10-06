import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'outline';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-700 focus-visible:outline-primary-500 disabled:hover:bg-primary-500',
  outline:
    'border border-border bg-surface text-secondary-900 hover:bg-background focus-visible:outline-primary-500 disabled:hover:bg-surface',
};

export function Button({
  variant = 'primary',
  loading = false,
  loadingText = 'Bezig…',
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm leading-[1.2] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
