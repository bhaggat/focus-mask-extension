import { describe, expect, it } from 'vitest';
import { generate, LOOP_SECONDS } from '../src/offscreen/synth';
import { BUILTIN_SOUNDS } from '../src/shared/sounds';

const SR = 22050;

function stats(ch: Float32Array) {
  let peak = 0, sum = 0, diffSum = 0;
  for (let i = 0; i < ch.length; i++) {
    const v = ch[i];
    if (!Number.isFinite(v)) throw new Error(`non-finite sample at ${i}`);
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
    if (i) diffSum += Math.abs(v - ch[i - 1]);
  }
  return { peak, rms: Math.sqrt(sum / ch.length), meanDiff: diffSum / (ch.length - 1) };
}

describe('procedural sounds', () => {
  it('has a generator and loop length for every built-in sound', () => {
    for (const s of BUILTIN_SOUNDS) expect(LOOP_SECONDS[s.id]).toBeGreaterThan(0);
  });

  for (const { id } of BUILTIN_SOUNDS) {
    it(`${id}: correct length, normalized, audible, seamless loop`, () => {
      const t0 = performance.now();
      const { left, right } = generate(id, SR);
      const ms = performance.now() - t0;
      expect(left.length).toBe(Math.floor(LOOP_SECONDS[id] * SR));
      expect(right.length).toBe(left.length);
      for (const ch of [left, right]) {
        const st = stats(ch);
        expect(st.peak).toBeLessThanOrEqual(0.8001);
        expect(st.rms).toBeGreaterThan(0.02);
        // Loop seam: the jump from last to first sample should be no larger than a typical step.
        const seam = Math.abs(ch[0] - ch[ch.length - 1]);
        expect(seam).toBeLessThan(st.meanDiff * 8 + 0.01);
      }
      // Stereo should be decorrelated, not identical.
      expect(left.some((v, i) => v !== right[i])).toBe(true);
      // Generation runs at 2x this sample rate in the browser; keep it snappy.
      expect(ms).toBeLessThan(3000);
    });
  }

  it('is deterministic', () => {
    const a = generate('rain', SR, 2).left;
    const b = generate('rain', SR, 2).left;
    expect(a).toEqual(b);
  });

  it('rejects unknown ids', () => {
    expect(() => generate('nope', SR, 1)).toThrow();
  });
});
