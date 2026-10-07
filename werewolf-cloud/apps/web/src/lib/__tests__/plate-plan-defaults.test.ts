import { describe, expect, it } from 'vitest';
import { evaluateAttemptWeight, isAttemptWeightLoadable, normalizeAttemptWeight } from '../plate-plan';
import { normalizeAttemptPlanForGender } from '../../routes/contests/new/draft';

/**
 * The API opens every contest with a 20 kg men's bar, a 15 kg women's bar and
 * 2.5 kg per clamp (POST /contests, migration 0005), and it rejects an attempt
 * below the bar plus both clamps. The web solver has to report the same minimum.
 */

const CLAMPS = { clampWeightPerClamp: 2.5 };

describe('plate plan defaults', () => {
  it('uses the 15 kg women bar the API creates', () => {
    expect(evaluateAttemptWeight(15, 'Female').barWeight).toBe(15);
    expect(normalizeAttemptWeight(10, 'Female')).toBe(15);
    // 15 kg bar + 2 x 2.5 kg clamps: loadable, where the old 20 kg default failed.
    expect(evaluateAttemptWeight(20, 'Female', CLAMPS).loadable).toBe(true);
  });

  it('reports the bar plus both clamps as the minimum below the bar', () => {
    const belowBar = evaluateAttemptWeight(15, 'Male', CLAMPS);

    expect(belowBar).toMatchObject({ loadable: false, reason: 'below_bar', normalized: 25 });
    expect(evaluateAttemptWeight(0, 'Male', CLAMPS).normalized).toBe(25);
    expect(evaluateAttemptWeight(19, 'Male', CLAMPS).normalized).toBe(25);
    // Without clamps the minimum stays the bare bar.
    expect(evaluateAttemptWeight(19, 'Male').normalized).toBe(20);
  });

  it('honours a lighter clamp when reporting the minimum', () => {
    const lighter = { clampWeightPerClamp: 1.5 };

    expect(evaluateAttemptWeight(15, 'Male', lighter).normalized).toBe(23);
    expect(normalizeAttemptWeight(15, 'Male', lighter)).toBe(23);
    expect(isAttemptWeightLoadable(23, 'Male', lighter)).toBe(true);
  });

  it('suggests a minimum that is itself loadable', () => {
    const suggested = evaluateAttemptWeight(5, 'Female', CLAMPS).normalized;

    expect(suggested).toBe(20);
    expect(isAttemptWeightLoadable(suggested, 'Female', CLAMPS)).toBe(true);
  });

  it('normalises wizard openers to the API minimum', () => {
    expect(normalizeAttemptPlanForGender({ Squat: 15 }, 'Female')).toEqual({ Squat: 20 });
    expect(normalizeAttemptPlanForGender({ Squat: 21 }, 'Female')).toEqual({ Squat: 21 });
  });
});
