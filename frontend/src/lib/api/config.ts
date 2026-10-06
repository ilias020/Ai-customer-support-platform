/**
 * Base URL of the Nimbus backend, e.g. `http://localhost:8000` (without `/api`).
 * `NEXT_PUBLIC_API_URL` is inlined at build time.
 */
export function getApiBaseUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured.');
  }

  return apiUrl.replace(/\/+$/, '');
}
