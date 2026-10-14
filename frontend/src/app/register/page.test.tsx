import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('RegisterPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is public: renders without a session and without any request', () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    render(<RegisterPage />);

    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByRole('heading', { name: 'Maak je account aan' }));
    expect(main).toContainElement(screen.getByRole('button', { name: 'Account aanmaken' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses the login layout with decorative illustrations hidden from assistive technology', () => {
    render(<RegisterPage />);

    const decorativeTexts = screen.getAllByText('Support Bot NL', { exact: false });
    expect(decorativeTexts).toHaveLength(2);
    for (const element of decorativeTexts) {
      expect(element.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
