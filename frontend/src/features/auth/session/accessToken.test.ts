import { afterEach, describe, expect, it } from 'vitest';

import { clearAccessToken, getAccessToken, setAccessToken } from './accessToken';

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
});
