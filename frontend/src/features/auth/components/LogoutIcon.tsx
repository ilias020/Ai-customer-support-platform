/** Outline logout icon (door with arrow), 20px grid; decorative. */
export function LogoutIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3" />
      <path d="M13 6.5 16.5 10 13 13.5" />
      <path d="M16.5 10H8" />
    </svg>
  );
}
