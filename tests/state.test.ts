import { describe, expect, it } from 'vitest';
import { initialState, isPlaying, pauseReasons, reduce, statusKind, type StateEvent } from '../src/shared/state';
import type { RuntimeState } from '../src/shared/types';

const run = (s: RuntimeState, ...events: StateEvent[]) => events.reduce((acc, e) => reduce(acc, e).state, s);
const fresh = () => initialState('brown', true);

describe('pause reasons state machine', () => {
  it('starts paused (manual) and plays on play', () => {
    const s = fresh();
    expect(pauseReasons(s)).toEqual(['manual']);
    expect(isPlaying(run(s, { type: 'play' }))).toBe(true);
  });

  it('toggle flips between playing and manual pause', () => {
    const s = run(fresh(), { type: 'toggle' });
    expect(isPlaying(s)).toBe(true);
    expect(pauseReasons(run(s, { type: 'toggle' }))).toEqual(['manual']);
  });

  it('auto-pauses while another tab is audible and resumes when quiet', () => {
    let s = run(fresh(), { type: 'play' }, { type: 'tabAudible', audible: true });
    expect(pauseReasons(s)).toEqual(['auto-tab']);
    expect(statusKind(s)).toBe('auto-tab');
    s = run(s, { type: 'tabAudible', audible: false });
    expect(isPlaying(s)).toBe(true);
  });

  it('does not auto-pause when the setting is off, and disabling clears an active auto-pause', () => {
    const off = run(initialState('brown', false), { type: 'play' }, { type: 'tabAudible', audible: true });
    expect(isPlaying(off)).toBe(true);
    const on = run(fresh(), { type: 'play' }, { type: 'tabAudible', audible: true });
    expect(isPlaying(on)).toBe(false);
    expect(isPlaying(run(on, { type: 'autoPause', enabled: false }))).toBe(true);
  });

  it('manual pause is sticky: tabs going quiet never resume it', () => {
    const s = run(
      fresh(),
      { type: 'play' },
      { type: 'tabAudible', audible: true },
      { type: 'pause' },
      { type: 'tabAudible', audible: false },
    );
    expect(pauseReasons(s)).toEqual(['manual']);
  });

  it('overlapping meeting + break: ending the meeting alone does not resume', () => {
    let s = run(fresh(), { type: 'play' }, { type: 'tabAudible', audible: true }, { type: 'breakStart', endsAt: 1 });
    expect(pauseReasons(s)).toEqual(['auto-tab', 'break']);
    s = run(s, { type: 'tabAudible', audible: false });
    expect(pauseReasons(s)).toEqual(['break']);
    expect(statusKind(s)).toBe('break');
    s = run(s, { type: 'breakEnd' });
    expect(isPlaying(s)).toBe(true);
  });

  it('pressing play during an audible tab overrides until that tab goes quiet', () => {
    let s = run(fresh(), { type: 'play' }, { type: 'tabAudible', audible: true }, { type: 'play' });
    expect(isPlaying(s)).toBe(true);
    expect(s.tabOverride).toBe(true);
    s = run(s, { type: 'tabAudible', audible: false });
    expect(s.tabOverride).toBe(false);
    s = run(s, { type: 'tabAudible', audible: true });
    expect(pauseReasons(s)).toEqual(['auto-tab']);
  });

  it('pressing play during a break ends the break and emits a cleanup effect', () => {
    const s = run(fresh(), { type: 'play' }, { type: 'breakStart', endsAt: 123 });
    const t = reduce(s, { type: 'play' });
    expect(isPlaying(t.state)).toBe(true);
    expect(t.state.breakEndsAt).toBeNull();
    expect(t.effects).toEqual([{ type: 'endBreakEarly' }]);
  });

  it('break fired while manually paused leaves it paused after the break', () => {
    const s = run(fresh(), { type: 'breakStart', endsAt: 1 }, { type: 'breakEnd' });
    expect(pauseReasons(s)).toEqual(['manual']);
  });

  it('select with play switches sound and plays; without play keeps state', () => {
    const a = run(fresh(), { type: 'select', soundId: 'rain', play: true });
    expect(a.soundId).toBe('rain');
    expect(isPlaying(a)).toBe(true);
    const b = run(fresh(), { type: 'select', soundId: 'ocean', play: false });
    expect(b.soundId).toBe('ocean');
    expect(isPlaying(b)).toBe(false);
  });

  it('error pauses and records the message; play clears it', () => {
    let s = run(fresh(), { type: 'play' }, { type: 'error', message: 'boom' });
    expect(s.error).toBe('boom');
    expect(isPlaying(s)).toBe(false);
    s = run(s, { type: 'play' });
    expect(s.error).toBeNull();
  });

  it('play pressed inside the pause-debounce window (raw audible, not yet debounced) still overrides', () => {
    let s = run(fresh(), { type: 'play', audibleNow: true });
    expect(s.tabOverride).toBe(true);
    s = run(s, { type: 'tabAudible', audible: true });
    expect(isPlaying(s)).toBe(true);
  });

  it('a raw-audible override is cleared if that episode ends before debouncing', () => {
    const s = run(fresh(), { type: 'toggle', audibleNow: true }, { type: 'tabAudible', audible: false });
    expect(s.tabOverride).toBe(false);
    expect(pauseReasons(run(s, { type: 'tabAudible', audible: true }))).toEqual(['auto-tab']);
  });
});
