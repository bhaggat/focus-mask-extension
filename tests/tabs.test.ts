import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudibleDebouncer } from '../src/background/tabs';

describe('AudibleDebouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ignores blips shorter than the pause delay', () => {
    const cb = vi.fn();
    const d = new AudibleDebouncer(false, cb, { pause: 1500, resume: 2000 });
    d.push(true);
    vi.advanceTimersByTime(1000);
    d.push(false);
    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
    expect(d.value).toBe(false);
  });

  it('fires after sustained audio, then after sustained quiet', () => {
    const cb = vi.fn();
    const d = new AudibleDebouncer(false, cb, { pause: 1500, resume: 2000 });
    d.push(true);
    d.push(true); // repeated readings don't restart the timer
    vi.advanceTimersByTime(1500);
    expect(cb).toHaveBeenLastCalledWith(true);
    d.push(false);
    vi.advanceTimersByTime(1999);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenLastCalledWith(false);
  });

  it('force applies immediately and cancels pending', () => {
    const cb = vi.fn();
    const d = new AudibleDebouncer(false, cb);
    d.push(true);
    d.force(true);
    expect(cb).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(10_000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
