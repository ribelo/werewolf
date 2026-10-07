/**
 * Decipher animation used by the current-attempt screen: the incoming text is
 * revealed left to right while the not-yet-revealed characters are scrambled.
 *
 * Every instance owns its timers, so a superseded animation can be cancelled
 * and can never write stale text over a newer value.
 */
export interface DecipherHandlers {
  /** Called with `true` when an animation starts and `false` when it settles. */
  onChanged: (changed: boolean) => void;
  /** Called with every intermediate frame. */
  onText: (text: string) => void;
  /** Called once the target text has settled. */
  onComplete: () => void;
}

const STEP_MS = 30;
const SETTLE_HOLD_MS = 500;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
const LITERAL_CHARS = new Set([' ', '•', ':', '.', ',']);

function scramble(target: string, revealed: number): string {
  let text = '';
  for (let index = 0; index < target.length; index++) {
    const char = target[index] ?? '';
    if (index < revealed || LITERAL_CHARS.has(char)) {
      text += char;
    } else {
      text += GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? '';
    }
  }
  return text;
}

export class DecipherAnimation {
  private stepTimer: ReturnType<typeof setInterval> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  get isRunning(): boolean {
    return this.stepTimer !== null || this.settleTimer !== null;
  }

  /** Stops any in-flight animation. Safe to call repeatedly. */
  cancel(): void {
    if (this.stepTimer !== null) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  /**
   * Animates from `previous` towards `target` and returns the text to show
   * immediately: the previous text while the animation runs, or `target` when
   * there is nothing to animate.
   */
  start(target: string, previous: string, handlers: DecipherHandlers): string {
    this.cancel();

    if (target === previous) {
      return target;
    }

    handlers.onChanged(true);

    let text = previous || '';
    let revealed = 0;
    const targetLength = target.length;

    handlers.onText(text);

    const stepTimer = setInterval(() => {
      if (revealed >= targetLength + 3) {
        clearInterval(stepTimer);
        if (this.stepTimer === stepTimer) {
          this.stepTimer = null;
        }
        handlers.onText(target);
        this.settleTimer = setTimeout(() => {
          this.settleTimer = null;
          handlers.onChanged(false);
          handlers.onComplete();
        }, SETTLE_HOLD_MS);
        return;
      }

      text = scramble(target, revealed);
      handlers.onText(text);
      revealed++;
    }, STEP_MS);

    this.stepTimer = stepTimer;
    return text;
  }
}
