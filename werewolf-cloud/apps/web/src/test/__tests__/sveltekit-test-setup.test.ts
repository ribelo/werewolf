import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

import { browser } from '$app/environment';
import { goto, preloadData } from '$app/navigation';
import { assets, base } from '$app/paths';
import { page } from '$app/stores';

import OnMountProbe from '../fixtures/on-mount-probe.svelte';

/**
 * Guards the unit-test environment itself: the '$app/*' stubs vitest.config.ts
 * aliases must resolve, and components must mount with the browser build of
 * svelte (the SSR build resolves onMount to a no-op).
 */
describe('SvelteKit test environment', () => {
  it('resolves the $app stubs', async () => {
    expect(browser).toBe(true);
    expect(base).toBe('');
    expect(assets).toBe('');
    expect(get(page).url).toBeInstanceOf(URL);

    await expect(goto('/login')).resolves.toBeUndefined();
    await expect(preloadData('/')).resolves.toMatchObject({ type: 'loaded', status: 200 });
  });

  it('runs onMount when a component mounts', () => {
    const onMounted = vi.fn();

    render(OnMountProbe, { props: { onMounted } });

    expect(onMounted).toHaveBeenCalledTimes(1);
  });
});
