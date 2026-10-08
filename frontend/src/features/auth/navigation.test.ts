import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_ROUTE, redirectToLogin } from './navigation';

describe('redirectToLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces the current page with the login page', () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });

    redirectToLogin();

    expect(LOGIN_ROUTE).toBe('/login');
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
