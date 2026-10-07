/**
 * Test stub for SvelteKit's virtual `$app/stores` module.
 *
 * The unit-test config does not load the SvelteKit Vite plugin, so the virtual
 * module would not resolve at all; vitest.config.ts aliases `$app/stores` here
 * instead. Components read the current URL and params from `page`; tests that
 * need a different URL mock this module themselves.
 */
import { readable } from 'svelte/store';

export interface StubPage {
  url: URL;
  params: Record<string, string>;
  route: { id: string | null };
  status: number;
  error: Error | null;
  data: Record<string, unknown>;
  state: Record<string, unknown>;
}

const pageValue: StubPage = {
  url: new URL('http://localhost/'),
  params: {},
  route: { id: null },
  status: 200,
  error: null,
  data: {},
  state: {},
};

export const page = readable<StubPage>(pageValue);

export const navigating = readable<null>(null);

export const updated = readable(false);
