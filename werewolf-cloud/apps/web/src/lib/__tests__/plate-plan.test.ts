import { describe, it, expect } from 'vitest';
import { evaluateAttemptWeight, isAttemptWeightLoadable, normalizeAttemptWeight } from '../plate-plan';

describe('evaluateAttemptWeight', () => {
  it('accepts 23 kg (three 0.5 kg plates per side) instead of normalising it to 22.5', () => {
    const check = evaluateAttemptWeight(23, 'Male');

    expect(check.loadable).toBe(true);
    expect(check.reason).toBeNull();
    expect(check.normalized).toBe(23);
    expect(check.barWeight).toBe(20);
    expect(check.increment).toBe(1);
    expect(normalizeAttemptWeight(23, 'Male')).toBe(23);
    expect(isAttemptWeightLoadable(23, 'Male')).toBe(true);
  });

  it('returns the closest loadable weight when the target is not loadable', () => {
    const check = evaluateAttemptWeight(23.3, 'Male');

    expect(check.loadable).toBe(false);
    expect(check.reason).toBe('unloadable');
    expect(check.normalized).toBe(23);
  });

  it('keeps the clamp-less behaviour when the caller does not provide clamps', () => {
    expect(evaluateAttemptWeight(23, 'Male').loadable).toBe(true);
    expect(evaluateAttemptWeight(22.5, 'Male').loadable).toBe(true);
  });

  it('accounts for clamps when the caller provides them', () => {
    const options = { clampWeightPerClamp: 2.5 };

    expect(evaluateAttemptWeight(25, 'Male', options).loadable).toBe(true);
    expect(evaluateAttemptWeight(23, 'Male', options).loadable).toBe(false);
    expect(evaluateAttemptWeight(23, 'Male', options).reason).toBe('unloadable');
    expect(evaluateAttemptWeight(23, 'Male', options).normalized).toBe(25);
    expect(normalizeAttemptWeight(23, 'Male', options)).toBe(25);
    expect(isAttemptWeightLoadable(23, 'Male', options)).toBe(false);

    // With lighter clamps the same target becomes the assembled bar weight.
    expect(evaluateAttemptWeight(23, 'Male', { clampWeightPerClamp: 1.5 }).loadable).toBe(true);
  });

  it('reports weights below the bar as below_bar', () => {
    const check = evaluateAttemptWeight(19, 'Male');

    expect(check.loadable).toBe(false);
    expect(check.reason).toBe('below_bar');
    expect(check.normalized).toBe(20);
    expect(evaluateAttemptWeight(0, 'Male').reason).toBe('below_bar');
    expect(evaluateAttemptWeight(Number.NaN, 'Male').reason).toBe('below_bar');
  });

  it('keeps normal competition weights loadable', () => {
    expect(isAttemptWeightLoadable(140, 'Male')).toBe(true);
    expect(isAttemptWeightLoadable(182.5, 'Female')).toBe(true);
    expect(isAttemptWeightLoadable(20, 'Male')).toBe(true);
  });
});
