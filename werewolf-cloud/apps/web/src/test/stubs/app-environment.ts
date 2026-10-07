/**
 * Test stub for SvelteKit's virtual `$app/environment` module.
 *
 * The unit-test config does not load the SvelteKit Vite plugin, so the virtual
 * module would not resolve at all; vitest.config.ts aliases `$app/environment`
 * here instead.
 */
export const browser = typeof window !== 'undefined';

export const dev = true;

export const building = false;

export const version = 'test';
