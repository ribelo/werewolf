import type { ContestDetail } from '$lib/types';

/**
 * Deprecated no-op kept for its existing call sites.
 *
 * It used to publish the contest through Svelte's context API, but
 * ContestManagerView calls it after an `await`, where `setContext` throws
 * ("setContext must be called during component initialisation"). Nothing reads
 * the context (no getContestContext caller exists), so the helper no longer
 * touches Svelte context and the call sites can simply be deleted.
 */
export function setContestContext(_contest: ContestDetail): void {
  // Intentionally empty: contest state lives in the contest store.
}
