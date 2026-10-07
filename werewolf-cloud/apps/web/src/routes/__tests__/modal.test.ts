import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import { modalStore } from '$lib/ui/modal';
import ModalHost from '$lib/components/ModalHost.svelte';
import FlightAssignmentModal from '$lib/components/FlightAssignmentModal.svelte';
import en from '$lib/i18n/locales/en.json';
import type { Registration } from '$lib/types';

interface FlightUpdate {
  id: string;
  flightCode: string;
  flightOrder: number | null;
}

function buildRegistration(overrides: Partial<Registration> & { id: string }): Registration {
  return {
    competitorId: `comp-${overrides.id}`,
    firstName: 'Anna',
    lastName: 'Kowalska',
    birthDate: '1992-01-01',
    gender: 'F',
    club: 'AZS',
    city: 'Warszawa',
    weightClassId: 'wc1',
    weightClassName: 'Do 67.5 kg',
    ageCategoryId: 'ac1',
    ageCategoryName: 'Senior (24-39)',
    bodyweight: 63.5,
    rackHeightSquat: 42,
    rackHeightBench: 36,
    reshelCoefficient: null,
    mcculloughCoefficient: null,
    competitionOrder: 1,
    lifts: ['Squat', 'Bench', 'Deadlift'],
    ...overrides,
  };
}

describe('modal system', () => {
  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  afterEach(() => {
    cleanup();
    // ensure clean slate for subsequent tests
    modalStore.closeAll();
  });

  it('resolves modal promise with provided value', async () => {
    const promise = modalStore.open<string>({ id: 'resolve-modal', title: 'Resolve Test' });
    modalStore.close('resolve-modal', 'resolved value');
    await expect(promise).resolves.toBe('resolved value');
  });

  it('rejects modal promise when closeAll is called', async () => {
    const promise = modalStore.open({ id: 'reject-modal', title: 'Reject Test' });
    modalStore.closeAll();
    await expect(promise).rejects.toThrow('Modal closed by closeAll()');
  });

  it('renders active modals from the store with ids derived from their own id', async () => {
    const first = modalStore.open({ id: 'first-modal', title: 'First Modal', content: 'first' });
    const second = modalStore.open({ id: 'second-modal', title: 'Second Modal', content: 'second' });
    // Prevent unhandled rejections if tests closeAll later
    first.catch(() => {});
    second.catch(() => {});

    render(ModalHost);

    expect(await screen.findByText('First Modal')).toBeInTheDocument();
    expect(screen.getByText('Second Modal')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    const firstDialog = screen.getByRole('dialog', { name: 'First Modal' });
    expect(firstDialog).toHaveAttribute('aria-labelledby', 'modal-title-first-modal');
    expect(firstDialog).toHaveAttribute('aria-describedby', 'modal-content-first-modal');
    expect(screen.getByText('first')).toHaveAttribute('id', 'modal-content-first-modal');
  });

  it('closes only the topmost dialog on Escape and hands Escape over to the one below', async () => {
    const first = modalStore.open({ id: 'stack-first', title: 'First dialog' });
    const second = modalStore.open({ id: 'stack-second', title: 'Second dialog' });
    first.catch(() => {});
    second.catch(() => {});

    render(ModalHost);
    await screen.findByRole('dialog', { name: 'Second dialog' });

    await fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Second dialog' })).toBeNull();
    });
    expect(screen.getByRole('dialog', { name: 'First dialog' })).toBeInTheDocument();
    await expect(second).resolves.toBeUndefined();

    // The lower dialog becomes the topmost one and keeps handling Escape.
    await fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'First dialog' })).toBeNull();
    });
    await expect(first).resolves.toBeUndefined();
  });

  it('keeps body scroll locked until the last dialog closes', async () => {
    const first = modalStore.open({ id: 'lock-first', title: 'Locked first' });
    const second = modalStore.open({ id: 'lock-second', title: 'Locked second' });
    first.catch(() => {});
    second.catch(() => {});

    render(ModalHost);
    await screen.findByRole('dialog', { name: 'Locked second' });
    expect(document.body.style.overflow).toBe('hidden');

    modalStore.close('lock-second');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Locked second' })).toBeNull();
    });
    expect(document.body.style.overflow).toBe('hidden');

    modalStore.close('lock-first');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Locked first' })).toBeNull();
    });
    expect(document.body.style.overflow).toBe('');
  });

  it('returns focus to the previously focused element when a dialog closes', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const first = modalStore.open({ id: 'focus-first', title: 'Focus first' });
    first.catch(() => {});

    render(ModalHost);
    const firstDialog = await screen.findByRole('dialog', { name: 'Focus first' });
    await waitFor(() => expect(firstDialog.contains(document.activeElement)).toBe(true));

    const second = modalStore.open({ id: 'focus-second', title: 'Focus second' });
    second.catch(() => {});
    const secondDialog = await screen.findByRole('dialog', { name: 'Focus second' });
    await waitFor(() => expect(secondDialog.contains(document.activeElement)).toBe(true));

    modalStore.close('focus-second');
    await waitFor(() => expect(document.activeElement).toBe(firstDialog));

    modalStore.close('focus-first');
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    trigger.remove();
  });

  it('awaits the caller save hook with the edited assignments and closes exactly once', async () => {
    const registrations = [
      buildRegistration({ id: 'reg-1' }),
      buildRegistration({ id: 'reg-2' }),
      buildRegistration({ id: 'reg-3' }),
    ];
    const callerSaved = vi.fn();
    const closeSpy = vi.spyOn(modalStore, 'close');

    const promise = modalStore.open<FlightUpdate[]>({
      id: 'flight-modal',
      title: 'Assign flights',
      component: FlightAssignmentModal,
      data: { registrations, onSaved: callerSaved },
    });

    render(ModalHost);
    await screen.findByRole('dialog', { name: 'Assign flights' });

    const perFlight = screen.getByLabelText('Athletes per flight') as HTMLInputElement;
    await fireEvent.input(perFlight, { target: { value: '2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Distribute flights' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const expected: FlightUpdate[] = [
      { id: 'reg-1', flightCode: 'A', flightOrder: 1 },
      { id: 'reg-2', flightCode: 'A', flightOrder: 2 },
      { id: 'reg-3', flightCode: 'B', flightOrder: 1 },
    ];

    await waitFor(() => expect(callerSaved).toHaveBeenCalledTimes(1));
    expect(callerSaved).toHaveBeenCalledWith(expected);
    await expect(promise).resolves.toEqual(expected);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(closeSpy).toHaveBeenCalledTimes(1);

    closeSpy.mockRestore();
  });

  it('keeps the dialog open when the caller save hook fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registrations = [buildRegistration({ id: 'reg-1' })];
    const callerSaved = vi.fn().mockRejectedValue(new Error('bulk-flight failed'));
    const closeSpy = vi.spyOn(modalStore, 'close');

    const promise = modalStore.open<FlightUpdate[]>({
      id: 'flight-reject-modal',
      title: 'Assign flights on failure',
      component: FlightAssignmentModal,
      data: { registrations, onSaved: callerSaved },
    });
    promise.catch(() => {});

    render(ModalHost);
    await screen.findByRole('dialog', { name: 'Assign flights on failure' });

    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(callerSaved).toHaveBeenCalledTimes(1));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Assign flights on failure' })).toBeInTheDocument();

    modalStore.close('flight-reject-modal');
    closeSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
