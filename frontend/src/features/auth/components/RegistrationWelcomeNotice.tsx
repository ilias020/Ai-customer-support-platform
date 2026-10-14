'use client';

import { useEffect, useState } from 'react';
import { registrationWelcomeMessage } from '../messages';
import { clearRegistrationNotice, isRegistrationNoticePending } from '../registrationNotice';
import { useCurrentUser } from '../session/CurrentUserContext';

/**
 * One-time welcome after registration, shown on the dashboard. It does not block navigation,
 * can be dismissed and is not shown again after a reload. Only rendered inside protected pages,
 * so the name comes from the user confirmed by `GET /api/users/me`.
 */
export function RegistrationWelcomeNotice() {
  const user = useCurrentUser();
  // Read once when the notice mounts (only in the browser: protected content is client-rendered).
  const [visible, setVisible] = useState(isRegistrationNoticePending);

  useEffect(() => {
    // Shown once: a later visit or remount of the dashboard does not show it again.
    clearRegistrationNotice();
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex w-full max-w-xl items-start gap-3 rounded-lg border border-success-500 bg-surface px-4 py-3 text-[13px] leading-[1.5] text-secondary-900 shadow-sm"
    >
      <span aria-hidden="true" className="font-semibold text-success-500">
        ✓
      </span>
      <p className="flex-1">{registrationWelcomeMessage(user.first_name)}</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Melding sluiten"
        className="rounded-sm px-1 text-neutral-400 hover:text-secondary-700 focus-visible:outline-2 focus-visible:outline-primary-500"
      >
        ×
      </button>
    </div>
  );
}
