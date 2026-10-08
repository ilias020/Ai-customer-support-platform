import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardPage from './page';

describe('DashboardPage (temporary login redirect destination)', () => {
  it('renders a minimal placeholder heading', () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });
});
