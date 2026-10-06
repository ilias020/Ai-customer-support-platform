import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  ref?: Ref<HTMLInputElement>;
  error?: string;
  endAdornment?: ReactNode;
};

export function TextField({
  id,
  label,
  error,
  endAdornment,
  className = '',
  ...inputProps
}: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] leading-[1.3] font-medium text-secondary-900">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`h-10 w-full rounded-lg border bg-surface px-3 text-sm leading-[18px] text-secondary-900 placeholder:text-neutral-400 focus:ring-2 focus:outline-none ${
            error
              ? 'border-error-500 focus:border-error-500 focus:ring-error-100'
              : 'border-border focus:border-primary-500 focus:ring-primary-100'
          } ${endAdornment ? 'pr-10' : ''} ${className}`}
          {...inputProps}
        />
        {endAdornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center">{endAdornment}</div>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-xs leading-[1.4] text-error-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
