/**
 * Procedural sound generators. Everything is synthesized locally — no audio
 * files, no network, no licensing questions. Each generator returns stereo
 * Float32 channels whose ends are crossfaded so they loop seamlessly.
 */

export interface Stereo {
  left: Float32Array;
  right: Float32Array;
}

type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const white = (rng: Rng) => rng() * 2 - 1;

/** Paul Kellet's refined pink-noise filter. */
function pinkSource(rng: Rng) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = white(rng);
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return out * 0.11;
  };
}

function brownSource(rng: Rng) {
  let last = 0;
  return () => {
    last = (last + 0.02 * white(rng)) / 1.02;
    return last * 3.5;
  };
}

/** RBJ biquad, direct form I. */
export function biquad(kind: 'lowpass' | 'highpass' | 'bandpass', freq: number, q: number, sr: number) {
  const w0 = (2 * Math.PI * freq) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (kind === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else if (kind === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
  } else {
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0, na1 = a1 / a0, na2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number) => {
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** One-pole smoother for slowly varying random modulation. */
function smoothRandom(rng: Rng, sr: number, ratePerSec: number) {
  let target = rng(), value = target, countdown = 0;
  const coeff = 1 - Math.exp(-ratePerSec / sr);
  return () => {
    if (--countdown <= 0) {
      target = rng();
      countdown = Math.floor(sr / ratePerSec);
    }
    value += (target - value) * coeff;
    return value;
  };
}

/**
 * Render `seconds + fade` of audio, then crossfade the overflow tail into
 * the head (equal-power, since the signals are uncorrelated) so the loop
 * boundary is inaudible.
 */
function renderLoop(seconds: number, sr: number, fadeSec: number, render: (l: Float32Array, r: Float32Array) => void): Stereo {
  const n = Math.floor(seconds * sr);
  const f = Math.floor(fadeSec * sr);
  const l = new Float32Array(n + f);
  const r = new Float32Array(n + f);
  render(l, r);
  for (let i = 0; i < f; i++) {
    const t = i / f;
    const gIn = Math.sin((t * Math.PI) / 2);
    const gOut = Math.cos((t * Math.PI) / 2);
    l[i] = l[i] * gIn + l[n + i] * gOut;
    r[i] = r[i] * gIn + r[n + i] * gOut;
  }
  return normalize({ left: l.slice(0, n), right: r.slice(0, n) }, 0.8);
}

export function normalize(s: Stereo, peak: number): Stereo {
  let max = 0;
  for (const ch of [s.left, s.right]) for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]));
  if (max > 0) {
    const g = peak / max;
    for (const ch of [s.left, s.right]) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  }
  return s;
}

/** Decorrelated stereo noise of a given colour. */
function noise(kind: 'white' | 'pink' | 'brown', sr: number, seconds: number, seed: number): Stereo {
  const make = (rng: Rng) => (kind === 'white' ? () => white(rng) * 0.5 : kind === 'pink' ? pinkSource(rng) : brownSource(rng));
  const sl = make(mulberry32(seed));
  const sr2 = make(mulberry32(seed + 1));
  return renderLoop(seconds, sr, 2, (l, r) => {
    for (let i = 0; i < l.length; i++) {
      l[i] = sl();
      r[i] = sr2();
    }
  });
}

function rain(sr: number, seconds: number, seed: number): Stereo {
  const rng = mulberry32(seed);
  return renderLoop(seconds, sr, 3, (l, r) => {
    const pinkL = pinkSource(mulberry32(seed + 1));
    const pinkR = pinkSource(mulberry32(seed + 2));
    const hpL = biquad('highpass', 500, 0.7, sr), hpR = biquad('highpass', 500, 0.7, sr);
    const lpL = biquad('lowpass', 9000, 0.7, sr), lpR = biquad('lowpass', 9000, 0.7, sr);
    const rumble = brownSource(mulberry32(seed + 3));
    const swell = smoothRandom(rng, sr, 0.15);
    // Droplets: short filtered noise bursts at random times and positions.
    const dropBp = biquad('bandpass', 3200, 1.2, sr);
    let dropEnv = 0, dropPan = 0.5, dropAmp = 0;
    const dropRate = 18 / sr;
    for (let i = 0; i < l.length; i++) {
      const s = 0.75 + 0.25 * swell();
      if (rng() < dropRate) {
        dropEnv = 1;
        dropPan = rng();
        dropAmp = 0.2 + rng() * 0.6;
      }
      dropEnv *= 0.9965;
      const drop = dropBp(white(rng)) * dropEnv * dropAmp * 2.2;
      const base = rumble() * 0.25;
      l[i] = lpL(hpL(pinkL())) * s + base + drop * (1 - dropPan);
      r[i] = lpR(hpR(pinkR())) * s + base + drop * dropPan;
    }
  });
}

function ocean(sr: number, seconds: number, seed: number): Stereo {
  const rng = mulberry32(seed);
  // Wave periods sum exactly to the loop length so the swell pattern loops cleanly.
  const periods = [9, 11, 8, 12];
  const total = periods.reduce((a, b) => a + b, 0);
  const scale = seconds / total;
  const n = Math.floor(seconds * sr);
  const env = new Float32Array(n);
  let pos = 0;
  for (const p of periods) {
    const len = Math.floor(p * scale * sr);
    const strength = 0.6 + rng() * 0.4;
    for (let i = 0; i < len && pos + i < n; i++) {
      const t = i / len;
      // Quick build, long wash out.
      const shape = t < 0.35 ? Math.sin((t / 0.35) * (Math.PI / 2)) ** 2 : Math.exp(-(t - 0.35) * 4.2);
      env[pos + i] = 0.12 + strength * shape;
    }
    pos += len;
  }
  return renderLoop(seconds, sr, 0.5, (l, r) => {
    const bl = brownSource(mulberry32(seed + 1)), br = brownSource(mulberry32(seed + 2));
    const pl = pinkSource(mulberry32(seed + 3)), pr = pinkSource(mulberry32(seed + 4));
    const hissL = biquad('highpass', 1200, 0.7, sr), hissR = biquad('highpass', 1200, 0.7, sr);
    for (let i = 0; i < l.length; i++) {
      const e = env[i % n];
      const lag = env[(i + n - Math.floor(0.15 * sr)) % n];
      l[i] = bl() * (0.3 + e * 0.7) + hissL(pl()) * e * e * 0.9;
      r[i] = br() * (0.3 + lag * 0.7) + hissR(pr()) * lag * lag * 0.9;
    }
  });
}

function fireplace(sr: number, seconds: number, seed: number): Stereo {
  const rng = mulberry32(seed);
  return renderLoop(seconds, sr, 2, (l, r) => {
    const roarL = brownSource(mulberry32(seed + 1)), roarR = brownSource(mulberry32(seed + 2));
    const lp = biquad('lowpass', 600, 0.7, sr), lp2 = biquad('lowpass', 600, 0.7, sr);
    const flicker = smoothRandom(rng, sr, 3);
    const crackleBp = biquad('bandpass', 2500, 0.9, sr);
    const popBp = biquad('bandpass', 900, 1.5, sr);
    let cEnv = 0, cAmp = 0, cPan = 0.5;
    let pEnv = 0, pAmp = 0, pPan = 0.5;
    const intensity = smoothRandom(rng, sr, 0.4);
    for (let i = 0; i < l.length; i++) {
      const rate = (4 + intensity() * 16) / sr;
      if (rng() < rate) {
        cEnv = 1;
        cAmp = 0.15 + rng() ** 2 * 0.85;
        cPan = rng();
      }
      if (rng() < 0.35 / sr) {
        pEnv = 1;
        pAmp = 0.5 + rng() * 0.5;
        pPan = rng();
      }
      cEnv *= 0.985;
      pEnv *= 0.996;
      const c = crackleBp(white(rng)) * cEnv * cAmp * 3;
      const p = popBp(white(rng)) * pEnv * pAmp * 2.5;
      const f = 0.7 + 0.3 * flicker();
      l[i] = lp(roarL()) * f * 1.4 + c * (1 - cPan) + p * (1 - pPan);
      r[i] = lp2(roarR()) * f * 1.4 + c * cPan + p * pPan;
    }
  });
}

function stream(sr: number, seconds: number, seed: number): Stereo {
  const rng = mulberry32(seed);
  // Bubble model: many tiny sines with rising pitch and fast decay.
  interface Bubble { phase: number; freq: number; rise: number; amp: number; decay: number; pan: number }
  return renderLoop(seconds, sr, 2, (l, r) => {
    const bubbles: Bubble[] = [];
    const bedL = pinkSource(mulberry32(seed + 1)), bedR = pinkSource(mulberry32(seed + 2));
    const bpL = biquad('bandpass', 900, 0.6, sr), bpR = biquad('bandpass', 900, 0.6, sr);
    const flow = smoothRandom(rng, sr, 0.5);
    for (let i = 0; i < l.length; i++) {
      if (rng() < (70 + flow() * 60) / sr) {
        const freq = 350 + rng() ** 1.5 * 1400;
        bubbles.push({
          phase: 0,
          freq,
          rise: 1 + (0.5 + rng()) * 0.00004 * (44100 / sr),
          amp: 0.04 + rng() * 0.12,
          decay: Math.exp(-(15 + rng() * 40) / sr),
          pan: rng(),
        });
      }
      let sl = 0, srr = 0;
      for (let b = bubbles.length - 1; b >= 0; b--) {
        const bb = bubbles[b];
        bb.phase += (2 * Math.PI * bb.freq) / sr;
        bb.freq *= bb.rise;
        bb.amp *= bb.decay;
        const v = Math.sin(bb.phase) * bb.amp;
        sl += v * (1 - bb.pan);
        srr += v * bb.pan;
        if (bb.amp < 0.0005) bubbles.splice(b, 1);
      }
      l[i] = sl + bpL(bedL()) * 0.5;
      r[i] = srr + bpR(bedR()) * 0.5;
    }
  });
}

function forest(sr: number, seconds: number, seed: number): Stereo {
  const rng = mulberry32(seed);
  return renderLoop(seconds, sr, 3, (l, r) => {
    const windL = pinkSource(mulberry32(seed + 1)), windR = pinkSource(mulberry32(seed + 2));
    const wbL = biquad('bandpass', 500, 0.5, sr), wbR = biquad('bandpass', 650, 0.5, sr);
    const gust = smoothRandom(rng, sr, 0.25);
    const leavesL = biquad('highpass', 3000, 0.7, sr), leavesR = biquad('highpass', 3000, 0.7, sr);
    // Birds: phrases of short frequency-swept chirps.
    let chirpsLeft = 0, nextChirp = 0, chirpPos = 0, chirpLen = 0;
    let f0 = 0, f1 = 0, phase = 0, amp = 0, pan = 0.5, gap = 0;
    let silence = Math.floor(sr * (1 + rng() * 3));
    for (let i = 0; i < l.length; i++) {
      const g = 0.4 + 0.6 * gust() ** 2;
      let bird = 0;
      if (chirpsLeft === 0) {
        if (--silence <= 0) {
          chirpsLeft = 2 + Math.floor(rng() * 5);
          const base = 2200 + rng() * 2500;
          f0 = base;
          f1 = base * (rng() < 0.5 ? 1.35 + rng() * 0.3 : 0.7 + rng() * 0.15);
          chirpLen = Math.floor(sr * (0.05 + rng() * 0.09));
          gap = Math.floor(sr * (0.06 + rng() * 0.12));
          amp = 0.05 + rng() * 0.1;
          pan = 0.15 + rng() * 0.7;
          chirpPos = 0;
          nextChirp = 0;
          silence = Math.floor(sr * (2 + rng() * 5));
        }
      } else if (nextChirp > 0) {
        nextChirp--;
      } else {
        const t = chirpPos / chirpLen;
        const freq = f0 + (f1 - f0) * t;
        phase += (2 * Math.PI * freq) / sr;
        bird = Math.sin(phase) * Math.sin(Math.PI * t) ** 2 * amp;
        if (++chirpPos >= chirpLen) {
          chirpPos = 0;
          chirpsLeft--;
          nextChirp = gap;
        }
      }
      l[i] = wbL(windL()) * g * 1.6 + leavesL(windL()) * g * g * 0.08 + bird * (1 - pan);
      r[i] = wbR(windR()) * g * 1.6 + leavesR(windR()) * g * g * 0.08 + bird * pan;
    }
  });
}

export const LOOP_SECONDS: Record<string, number> = {
  white: 8,
  pink: 12,
  brown: 12,
  rain: 30,
  ocean: 40,
  stream: 30,
  fireplace: 30,
  forest: 45,
};

export function generate(id: string, sr: number, secondsOverride?: number): Stereo {
  const seconds = secondsOverride ?? LOOP_SECONDS[id];
  switch (id) {
    case 'white':
    case 'pink':
    case 'brown':
      return noise(id, sr, seconds, 1337);
    case 'rain':
      return rain(sr, seconds, 42);
    case 'ocean':
      return ocean(sr, seconds, 7);
    case 'stream':
      return stream(sr, seconds, 99);
    case 'fireplace':
      return fireplace(sr, seconds, 5);
    case 'forest':
      return forest(sr, seconds, 2024);
    default:
      throw new Error(`Unknown sound: ${id}`);
  }
}
