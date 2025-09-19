import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { toast } from '$lib/ui/toast';

// Ensure deterministic ids
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: vi.fn(() => Math.random().toString(36).slice(2)) },
});

describe('toast system', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toast.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    toast.clear();
  });

  it('adds toast with correct level and message', () => {
    const id = toast.success('Created successfully');
    let items = [] as unknown[];
    const unsubscribe = toast.subscribe((value) => (items = value));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, message: 'Created successfully', level: 'success' });

    unsubscribe();
  });

  it('removes toast by id', () => {
    const id1 = toast.success('First');
    const id2 = toast.error('Second');

    toast.remove(id1);

    let items = [] as unknown[];
    const unsubscribe = toast.subscribe((value) => (items = value));

    expect(items).toHaveLength(1);
    expect((items[0] as any).id).toBe(id2);

    unsubscribe();
  });

  it('auto-dismisses toast after duration', () => {
    toast.info('Auto dismiss', { duration: 2000 });

    let items = [] as unknown[];
    const unsubscribe = toast.subscribe((value) => (items = value));
    expect(items).toHaveLength(1);

    vi.advanceTimersByTime(2000);

    expect(items).toHaveLength(0);
    unsubscribe();
  });

});
