/**
 * Custom sounds up to this length are decoded into an AudioBuffer so they loop
 * without the gap `<audio loop>` leaves (notably with MP3 encoder padding).
 * 3 min of 48 kHz stereo float ≈ 69 MB of PCM — longer files stream instead.
 */
export const DECODE_MAX_SEC = 180;

export function loopModeFor(durationSec: number): 'buffer' | 'element' {
  return durationSec > 0 && durationSec <= DECODE_MAX_SEC ? 'buffer' : 'element';
}
