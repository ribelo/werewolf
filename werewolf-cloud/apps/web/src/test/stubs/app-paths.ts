/**
 * Test stub for SvelteKit's virtual `$app/paths` module.
 *
 * The unit-test config does not load the SvelteKit Vite plugin, so the virtual
 * module would not resolve at all; vitest.config.ts aliases `$app/paths` here
 * instead. Tests never run behind a base path.
 */
export const base = '';

export const assets = '';

export const asset = (file: string): string => file;

export const resolveRoute = (id: string): string => id;

export const resolve = resolveRoute;
