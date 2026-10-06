import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LoginPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('LoginPage', () => {
  it('renders the login form inside the main landmark', () => {
    render(<LoginPage />);

    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByRole('heading', { name: 'Welkom terug' }));
    expect(main).toContainElement(screen.getByRole('button', { name: 'Inloggen' }));
  });

  it('hides the decorative illustrations from assistive technology', () => {
    const { container } = render(<LoginPage />);

    const decorativeTexts = screen.getAllByText('Support Bot NL', { exact: false });
    expect(decorativeTexts).toHaveLength(2);
    for (const element of decorativeTexts) {
      expect(element.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(container.querySelector('main [aria-hidden="true"] p')).toBeNull();
  });
});
