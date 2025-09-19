import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { modalStore } from '$lib/ui/modal';
import Modal from '$lib/components/Modal.svelte';
import ModalHost from '$lib/components/ModalHost.svelte';

// Stable modal id for tests
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: vi.fn(() => 'test-modal-id') },
});

describe('modal system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    // ensure clean slate for subsequent tests
    modalStore.closeAll();
  });

  it('resolves modal promise with provided value', async () => {
    const promise = modalStore.open<string>({ title: 'Resolve Test' });
    modalStore.close('test-modal-id', 'resolved value');
    await expect(promise).resolves.toBe('resolved value');
  });

  it('rejects modal promise when closeAll is called', async () => {
    const promise = modalStore.open({ title: 'Reject Test' });
    modalStore.closeAll();
    await expect(promise).rejects.toThrow('Modal closed by closeAll()');
  });

  it('renders active modals from the store', async () => {
    const first = modalStore.open({ title: 'First Modal', content: 'first' });
    const second = modalStore.open({ title: 'Second Modal', content: 'second' });
    // Prevent unhandled rejections if tests closeAll later
    first.catch(() => {});
    second.catch(() => {});

    render(ModalHost);

    expect(await screen.findByText('First Modal')).toBeInTheDocument();
    expect(screen.getByText('Second Modal')).toBeInTheDocument();
  });
});
