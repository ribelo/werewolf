/**
 * Test stub for SvelteKit's virtual `$app/navigation` module.
 *
 * The unit-test config does not load the SvelteKit Vite plugin, so the virtual
 * module would not resolve at all; vitest.config.ts aliases `$app/navigation`
 * here instead. Navigating has no meaning inside a unit test, so every export
 * is a no-op; a test that cares about navigation mocks this module itself.
 *
 * Importers are type-checked against SvelteKit's own module declaration for
 * `$app/navigation`, so these signatures only need to be runtime-compatible.
 */
export const goto = async (): Promise<void> => {};

export const invalidate = async (): Promise<void> => {};

export const invalidateAll = async (): Promise<void> => {};

export const refreshAll = async (): Promise<void> => {};

export const preloadCode = async (): Promise<void> => {};

export const preloadData = async (): Promise<{
  type: 'loaded';
  status: number;
  data: Record<string, unknown>;
}> => ({ type: 'loaded', status: 200, data: {} });

export const beforeNavigate = (): void => {};

export const afterNavigate = (): void => {};

export const onNavigate = (): void => {};

export const pushState = (): void => {};

export const replaceState = (): void => {};

export const disableScrollHandling = (): void => {};
