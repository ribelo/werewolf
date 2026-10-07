import { describe, expect, it } from 'vitest';
import type { ContestDetail } from '$lib/types';
import { setContestContext } from '$lib/ui/context-helpers';

function contestFixture(): ContestDetail {
  return {
    id: 'contest-1',
    name: 'Spring Cup',
    date: '2026-04-01',
    location: 'Warsaw',
    discipline: 'powerlifting',
    status: 'draft',
    mensBarWeight: 20,
    womensBarWeight: 15,
    clampWeight: 2.5,
    registrations: [],
  };
}

describe('setContestContext', () => {
  it('does not throw when called outside component initialisation', () => {
    expect(() => setContestContext(contestFixture())).not.toThrow();
  });

  it('does not throw when called after an await', async () => {
    await Promise.resolve();

    expect(() => setContestContext(contestFixture())).not.toThrow();
  });

  it('is a no-op that returns nothing', () => {
    expect(setContestContext(contestFixture())).toBeUndefined();
  });
});
