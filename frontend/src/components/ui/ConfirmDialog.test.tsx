import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(
  props: { open?: boolean; busy?: boolean; error?: string; icon?: React.ReactNode } = {},
) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const view = render(
    <ConfirmDialog
      open={props.open ?? true}
      busy={props.busy}
      icon={props.icon}
      error={props.error}
      title="Titel"
      description="Beschrijving"
      cancelLabel="Annuleren"
      confirmLabel="Bevestigen"
      confirmingLabel="Bezig…"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { ...view, onCancel, onConfirm };
}

describe('ConfirmDialog', () => {
  it('opens as a modal dialog labelled by its title and description', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Titel' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription('Beschrijving');
    expect(screen.getByRole('button', { name: 'Annuleren' })).toHaveFocus();
  });

  it('is closed while `open` is false', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks the parent to cancel on Escape and keeps the native dialog open itself', () => {
    const { onCancel } = renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Titel' });
    const escape = new Event('cancel', { cancelable: true });

    fireEvent(dialog, escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ignores Escape while busy', () => {
    const { onCancel } = renderDialog({ busy: true });

    fireEvent(
      screen.getByRole('dialog', { name: 'Titel' }),
      new Event('cancel', { cancelable: true }),
    );

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Annuleren' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Bezig…/ })).toBeDisabled();
  });

  it('shows an error as an alert inside the dialog', () => {
    renderDialog({ error: 'Er ging iets mis.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Er ging iets mis.');
  });

  it('closes when `open` becomes false', () => {
    const { rerender, onCancel, onConfirm } = renderDialog();

    rerender(
      <ConfirmDialog
        open={false}
        title="Titel"
        description="Beschrijving"
        cancelLabel="Annuleren"
        confirmLabel="Bevestigen"
        confirmingLabel="Bezig…"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an optional decorative icon above the title', () => {
    renderDialog({ icon: <svg data-testid="icon" /> });

    const icon = screen.getByTestId('icon');
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Titel' })).toHaveAccessibleName('Titel');
  });

  it('stays open when the browser closes it while busy (repeated Escape in Chrome)', () => {
    const { onCancel } = renderDialog({ busy: true });
    const dialog = screen.getByRole('dialog', { name: 'Titel' }) as HTMLDialogElement;

    // Chrome closes the dialog without a cancelable cancel event after repeated Escape presses.
    act(() => dialog.close());

    expect(dialog).toHaveAttribute('open');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('reports a browser-initiated close while idle as a cancel', () => {
    const { onCancel } = renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Titel' }) as HTMLDialogElement;

    act(() => dialog.close());

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not report a cancel when the parent closes the dialog', () => {
    const { rerender, onCancel, onConfirm } = renderDialog();

    rerender(
      <ConfirmDialog
        open={false}
        title="Titel"
        description="Beschrijving"
        cancelLabel="Annuleren"
        confirmLabel="Bevestigen"
        confirmingLabel="Bezig…"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('uses the destructive button for the confirm action in the destructive tone', () => {
    render(
      <ConfirmDialog
        open
        tone="destructive"
        title="Titel"
        description="Beschrijving"
        cancelLabel="Annuleren"
        confirmLabel="Bevestigen"
        confirmingLabel="Bezig…"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Bevestigen' }).className).toContain('bg-error-500');
    expect(screen.getByRole('button', { name: 'Annuleren' }).className).not.toContain('bg-error');
  });
});
