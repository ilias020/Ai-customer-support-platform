import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Snackbar } from './Snackbar';

const wrapperOf = (text: string) => screen.getByText(text).parentElement?.parentElement;

describe('Snackbar', () => {
  it('floats at the bottom by default on every screen size', () => {
    render(<Snackbar onDismiss={vi.fn()}>Opgeslagen</Snackbar>);

    const className = wrapperOf('Opgeslagen')?.className ?? '';
    expect(className).toMatch(/(^|\s)fixed(\s|$)/);
    expect(className).toContain('bottom-4');
  });

  it('floats at the top on every screen size with position="top"', () => {
    render(
      <Snackbar position="top" onDismiss={vi.fn()}>
        Opgeslagen
      </Snackbar>,
    );

    const className = wrapperOf('Opgeslagen')?.className ?? '';
    expect(className).toMatch(/(^|\s)fixed(\s|$)/);
    expect(className).toContain('md:top-6');
  });

  it('is part of the page flow on mobile with mobileLayout="inline"', () => {
    render(
      <Snackbar position="top" mobileLayout="inline" onDismiss={vi.fn()}>
        Opgeslagen
      </Snackbar>,
    );

    const className = wrapperOf('Opgeslagen')?.className ?? '';
    expect(className).not.toMatch(/(^|\s)fixed(\s|$)/);
    expect(className).toContain('md:fixed');
  });

  it('can be dismissed', async () => {
    const onDismiss = vi.fn();
    render(<Snackbar onDismiss={onDismiss}>Opgeslagen</Snackbar>);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Melding sluiten' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
