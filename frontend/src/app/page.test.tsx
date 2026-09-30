import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from './page';

const invalidType: string = 123;

describe('Home', () => {
  it('toont de Nimbus-titel', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'Nimbus' })).toBeInTheDocument();
  });
});
