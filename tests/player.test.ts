import { describe, expect, it } from 'vitest';
import { DECODE_MAX_SEC, loopModeFor } from '../src/offscreen/loopMode';

describe('loopModeFor', () => {
  it('decodes short custom files for gapless looping', () => {
    expect(DECODE_MAX_SEC).toBe(180);
    expect(loopModeFor(2)).toBe('buffer');
    expect(loopModeFor(180)).toBe('buffer');
  });

  it('streams long or unknown-length files through <audio loop>', () => {
    expect(loopModeFor(180.5)).toBe('element');
    expect(loopModeFor(0)).toBe('element');
    expect(loopModeFor(Number.NaN)).toBe('element');
  });
});
