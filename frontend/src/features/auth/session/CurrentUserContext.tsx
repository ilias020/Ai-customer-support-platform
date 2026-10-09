'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { CurrentUser } from '../api/currentUser';

const CurrentUserContext = createContext<CurrentUser | null>(null);

/** Provides the user confirmed by `GET /api/users/me`; only rendered by `ProtectedRoute`. */
export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/**
 * Returns the authenticated user inside protected pages and components.
 *
 * The value only comes from a validated `/me` response held in memory; it is never read from
 * browser storage. Using this hook outside the (protected) route group is a programming error.
 */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);

  if (!user) {
    throw new Error('useCurrentUser must be used inside a protected page (ProtectedRoute).');
  }

  return user;
}
