/**
 * One-time "account created" notice for the dashboard.
 * Kept in memory only (no browser storage): it survives the client-side navigation to the
 * dashboard after registration and is gone once it has been shown or after a reload.
 */
let pending = false;

export function markRegistrationCompleted(): void {
  pending = true;
}

export function isRegistrationNoticePending(): boolean {
  return pending;
}

export function clearRegistrationNotice(): void {
  pending = false;
}
