import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { toast, type Toast } from '$lib/ui/toast';

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
    const id = toast.warning('Heads up');
    let items: Toast[] = [];
    const unsubscribe = toast.subscribe((value) => (items = value));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, message: 'Heads up', level: 'warning' });

    unsubscribe();
  });

  it('removes toast by id', () => {
    const id1 = toast.warning('First');
    const id2 = toast.error('Second');

    toast.remove(id1);

    let items: Toast[] = [];
    const unsubscribe = toast.subscribe((value) => (items = value));

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(id2);

    unsubscribe();
  });

  it('auto-dismisses toast after duration', () => {
    toast.warning('Auto dismiss', { duration: 2000 });

    let items: Toast[] = [];
    const unsubscribe = toast.subscribe((value) => (items = value));
    expect(items).toHaveLength(1);

    vi.advanceTimersByTime(2000);

    expect(items).toHaveLength(0);
    unsubscribe();
  });

  it('suppresses info and success notifications', () => {
    toast.success('All good');
    toast.info('FYI');

    let items: Toast[] = [];
    const unsubscribe = toast.subscribe((value) => (items = value));

    expect(items).toHaveLength(0);

    unsubscribe();
  });

});
