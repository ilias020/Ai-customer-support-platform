import { afterEach, describe, expect, it } from 'vitest';

import {
  clearAccessToken,
  getAccessToken,
  getSessionVersion,
  setAccessToken,
  startSession,
} from './accessToken';

describe('accessToken', () => {
  afterEach(() => clearAccessToken());

  it('keeps the access token in memory only', () => {
    expect(getAccessToken()).toBeNull();

    setAccessToken('in-memory-token');

    expect(getAccessToken()).toBe('in-memory-token');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('in-memory-token');
  });

  it('can be cleared', () => {
    setAccessToken('in-memory-token');
    clearAccessToken();

    expect(getAccessToken()).toBeNull();
  });

  it('starts a new session version on login and on clear, but not on a token refresh', () => {
    const initial = getSessionVersion();

    startSession('login-token');
    const afterLogin = getSessionVersion();
    setAccessToken('refreshed-token');
    const afterRefresh = getSessionVersion();
    clearAccessToken();

    expect(afterLogin).toBe(initial + 1);
    expect(afterRefresh).toBe(afterLogin);
    expect(getSessionVersion()).toBe(afterLogin + 1);
  });
});
