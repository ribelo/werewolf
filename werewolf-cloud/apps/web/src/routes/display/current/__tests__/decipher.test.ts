import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DecipherAnimation } from '../decipher';

function handlers() {
  return {
    onChanged: vi.fn(),
    onText: vi.fn(),
    onComplete: vi.fn(),
  };
}

describe('DecipherAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals the target text and settles', () => {
    const animation = new DecipherAnimation();
    const h = handlers();

    expect(animation.start('25.00', '', h)).toBe('');
    expect(h.onChanged).toHaveBeenCalledWith(true);
    expect(h.onText).toHaveBeenLastCalledWith('');

    vi.advanceTimersByTime(300);
    expect(h.onText).toHaveBeenLastCalledWith('25.00');

    vi.advanceTimersByTime(500);
    expect(h.onChanged).toHaveBeenLastCalledWith(false);
    expect(h.onComplete).toHaveBeenCalledTimes(1);
    expect(animation.isRunning).toBe(false);
  });

  it('cancels a superseded animation so it cannot write stale text', () => {
    const animation = new DecipherAnimation();
    const first = handlers();

    animation.start('25.00', '', first);
    vi.advanceTimersByTime(30);
    expect(first.onText).toHaveBeenCalledTimes(2);
    first.onText.mockClear();

    const second = handlers();
    animation.start('30.00', '25.00', second);

    vi.advanceTimersByTime(2000);

    expect(first.onText).not.toHaveBeenCalled();
    expect(first.onComplete).not.toHaveBeenCalled();
    expect(first.onChanged).toHaveBeenCalledTimes(1);
    expect(first.onChanged).toHaveBeenLastCalledWith(true);

    expect(second.onText).toHaveBeenLastCalledWith('30.00');
    expect(second.onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not animate when the target did not change', () => {
    const animation = new DecipherAnimation();
    const h = handlers();

    expect(animation.start('20.00', '20.00', h)).toBe('20.00');
    expect(h.onChanged).not.toHaveBeenCalled();
    expect(animation.isRunning).toBe(false);
  });

  it('cancel stops every pending callback', () => {
    const animation = new DecipherAnimation();
    const h = handlers();

    animation.start('20.00', '', h);
    animation.cancel();

    expect(animation.isRunning).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(h.onComplete).not.toHaveBeenCalled();
    expect(h.onChanged).toHaveBeenCalledTimes(1);
  });
});
