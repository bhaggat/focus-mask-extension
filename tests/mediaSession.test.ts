import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaKeySession, silentWav } from '../src/offscreen/mediaSession';

class FakeSession {
  metadata: unknown = null;
  playbackState: MediaSessionPlaybackState = 'none';
  handlers = new Map<string, (() => void) | null>();
  setActionHandler(a: string, h: (() => void) | null) {
    this.handlers.set(a, h);
  }
}

function fakeAudio() {
  return { loop: false, play: vi.fn(async () => {}), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() };
}

(globalThis as unknown as { MediaMetadata: unknown }).MediaMetadata = class {
  constructor(public init: object) {}
};
URL.createObjectURL ??= () => 'blob:x';

describe('MediaKeySession', () => {
  let ms: FakeSession;
  let audios: ReturnType<typeof fakeAudio>[];
  let actions: string[];
  let s: MediaKeySession;

  beforeEach(() => {
    ms = new FakeSession();
    audios = [];
    actions = [];
    s = new MediaKeySession(
      (a) => actions.push(a),
      ms as unknown as MediaSession,
      () => {
        const a = fakeAudio();
        audios.push(a);
        return a as unknown as HTMLAudioElement;
      },
    );
  });

  it('claims the session only while enabled and playing', () => {
    s.configure({ enabled: true, title: 'Rain' });
    expect(s.claimed).toBe(false);
    s.setPlaying(true);
    expect(s.claimed).toBe(true);
    expect(audios[0].play).toHaveBeenCalled();
    expect(ms.playbackState).toBe('playing');
    ms.handlers.get('pause')!();
    ms.handlers.get('play')!();
    ms.handlers.get('stop')!();
    expect(actions).toEqual(['pause', 'play', 'pause']);
  });

  it('keeps a paused session so the same button resumes', () => {
    s.configure({ enabled: true, title: 'Rain' });
    s.setPlaying(true);
    s.setPlaying(false);
    expect(s.claimed).toBe(true);
    expect(audios[0].pause).toHaveBeenCalled();
    expect(ms.playbackState).toBe('paused');
  });

  it('releases the session when disabled (another tab audible / setting off)', () => {
    s.configure({ enabled: true, title: 'Rain' });
    s.setPlaying(true);
    s.configure({ enabled: false, title: 'Rain' });
    expect(s.claimed).toBe(false);
    expect(audios[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(ms.playbackState).toBe('none');
    expect(ms.handlers.get('play')).toBeNull();
    // Re-enabled while still playing: claims again.
    s.configure({ enabled: true, title: 'Rain' });
    expect(s.claimed).toBe(true);
  });

  it('never claims while disabled', () => {
    s.configure({ enabled: false, title: 'Rain' });
    s.setPlaying(true);
    expect(s.claimed).toBe(false);
    expect(audios).toHaveLength(0);
  });
});

describe('silentWav', () => {
  it('is a ≥5s PCM WAV (Chrome ignores shorter media for sessions)', async () => {
    const b = silentWav();
    const v = new DataView(await b.arrayBuffer());
    const rate = v.getUint32(24, true);
    const bytes = v.getUint32(40, true);
    expect(bytes / 2 / rate).toBeGreaterThanOrEqual(5);
    expect(b.type).toBe('audio/wav');
  });
});
