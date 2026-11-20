import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountdownTicker } from '../src/background/countdown';

describe('CountdownTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('ticks every second and calls onDone once at `at`', () => {
    const tick = vi.fn();
    const done = vi.fn();
    const t = new CountdownTicker(tick, done);
    t.start(5000);
    expect(t.active).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(done).not.toHaveBeenCalled();
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(4);
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(t.active).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels the pending transition', () => {
    const done = vi.fn();
    const t = new CountdownTicker(() => {}, done);
    t.start(5000);
    t.stop();
    vi.advanceTimersByTime(10_000);
    expect(done).not.toHaveBeenCalled();
    expect(t.active).toBe(false);
  });

  it('restarting only fires for the latest target', () => {
    const done = vi.fn();
    const t = new CountdownTicker(() => {}, done);
    t.start(5000);
    t.start(8000);
    vi.advanceTimersByTime(6000);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
