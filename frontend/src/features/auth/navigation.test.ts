import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLoginUrl,
  DEFAULT_AUTHENTICATED_ROUTE,
  getCurrentPath,
  getPostLoginRedirect,
  LOGIN_ROUTE,
  redirectToLogin,
  sanitizeReturnPath,
} from './navigation';

function stubLocation(location: Partial<Location>) {
  const replace = vi.fn();
  vi.stubGlobal('location', { pathname: '/', search: '', hash: '', ...location, replace });
  return replace;
}

describe('redirectToLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces the current page with the login page', () => {
    const replace = stubLocation({});

    redirectToLogin();

    expect(LOGIN_ROUTE).toBe('/login');
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('passes a safe return path as the next parameter', () => {
    const replace = stubLocation({});

    redirectToLogin('/dashboard?tab=open');

    expect(replace).toHaveBeenCalledWith('/login?next=%2Fdashboard%3Ftab%3Dopen');
  });

  it('drops an unsafe return path', () => {
    const replace = stubLocation({});

    redirectToLogin('https://evil.example/phish');

    expect(replace).toHaveBeenCalledWith('/login');
  });
});

describe('getCurrentPath', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns path, query and hash of the current page', () => {
    stubLocation({ pathname: '/dashboard', search: '?tab=open', hash: '#top' });

    expect(getCurrentPath()).toBe('/dashboard?tab=open#top');
  });
});

describe('sanitizeReturnPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/dashboard?tab=open#top', '/dashboard?tab=open#top'],
    ['/conversations/123', '/conversations/123'],
  ])('accepts internal path %s', (value, expected) => {
    expect(sanitizeReturnPath(value)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'dashboard',
    'https://evil.example',
    'http://localhost:3000/dashboard',
    '//evil.example',
    '//evil.example/dashboard',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/dash\nboard',
    '/login',
    '/login?next=%2Fdashboard',
    '/../login',
    `/${'a'.repeat(2048)}`,
  ])('rejects %s', (value) => {
    expect(sanitizeReturnPath(value)).toBeNull();
  });
});

describe('buildLoginUrl', () => {
  it('returns the plain login route without a safe return path', () => {
    expect(buildLoginUrl()).toBe('/login');
    expect(buildLoginUrl('//evil.example')).toBe('/login');
  });

  it('encodes the return path', () => {
    expect(buildLoginUrl('/dashboard')).toBe('/login?next=%2Fdashboard');
  });
});

describe('getPostLoginRedirect', () => {
  it('returns the requested internal path', () => {
    expect(getPostLoginRedirect('?next=%2Fdashboard%3Ftab%3Dopen')).toBe('/dashboard?tab=open');
  });

  it.each([
    '',
    '?next=',
    '?next=https%3A%2F%2Fevil.example',
    '?next=%2F%2Fevil.example',
    '?next=%2Flogin',
  ])('falls back to the default route for %s', (search) => {
    expect(getPostLoginRedirect(search)).toBe(DEFAULT_AUTHENTICATED_ROUTE);
  });
});
