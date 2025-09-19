import { getContext, setContext } from 'svelte';
import type { ContestDetail } from '$lib/types';

const CONTEST_CONTEXT_KEY = 'contest-context';

export interface ContestContext {
  contest: ContestDetail;
  updateContest: (contest: ContestDetail) => void;
}

/**
 * Set contest context in a parent component.
 * Call this in a component that wraps other components that need contest data.
 *
 * @param contest - The contest data to provide to child components
 * @returns The contest context object
 *
 * @example
 * ```svelte
 * <script>
 *   import { setContestContext } from '$lib/ui/context-helpers';
 *   import type { ContestDetail } from '$lib/types';
 *
 *   export let contest: ContestDetail;
 *
 *   const context = setContestContext(contest);
 * </script>
 *
 * <!-- Child components can now access contest data -->
 * <slot />
 * ```
 */
export function setContestContext(contest: ContestDetail): ContestContext {
  const context: ContestContext = {
    contest,
    updateContest: (newContest: ContestDetail) => {
      context.contest = newContest;
    },
  };

  setContext(CONTEST_CONTEXT_KEY, context);
  return context;
}

/**
 * Get contest context in a child component.
 * Call this in components that need access to contest data.
 *
 * @returns The contest context object
 * @throws Error if no contest context is found (must be called within a component that has a parent with setContestContext)
 *
 * @example
 * ```svelte
 * <script>
 *   import { getContestContext } from '$lib/ui/context-helpers';
 *
 *   const { contest, updateContest } = getContestContext();
 * </script>
 *
 * <h1>{contest.name}</h1>
 * <p>{contest.location}</p>
 * ```
 */
export function getContestContext(): ContestContext {
  const context = getContext<ContestContext>(CONTEST_CONTEXT_KEY);

  if (!context) {
    throw new Error(
      'Contest context not found. Make sure this component is wrapped by a parent component that calls setContestContext().'
    );
  }

  return context;
}

/**
 * Safely get contest context without throwing an error.
 * Returns null if no context is found.
 *
 * @returns The contest context object or null
 *
 * @example
 * ```svelte
 * <script>
 *   import { getContestContextSafe } from '$lib/ui/context-helpers';
 *
 *   const context = getContestContextSafe();
 *   $: contest = context?.contest;
 * </script>
 *
 * {#if contest}
 *   <h1>{contest.name}</h1>
 * {/if}
 * ```
 */
export function getContestContextSafe(): ContestContext | null {
  try {
    return getContestContext();
  } catch {
    return null;
  }
}