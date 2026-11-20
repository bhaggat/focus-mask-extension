import type { BgMessage, OffscreenMessage } from '../shared/types';
import { MediaKeySession } from './mediaSession';
import { Player } from './player';

const player = new Player();
const session = new MediaKeySession((action) => {
  void chrome.runtime.sendMessage({ type: 'mediaKey', action } satisfies BgMessage).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((msg: OffscreenMessage, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  switch (msg.type) {
    case 'play':
      session.configure(msg.session);
      player
        .play(msg.soundId, msg.volume)
        .then((started) => {
          // A superseded play must not flip the OS media controls back to "playing".
          if (started) session.setPlaying(true);
          sendResponse({ ok: true });
        })
        .catch((e: unknown) => {
          session.setPlaying(false);
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        });
      return true;
    case 'pause':
      player.pause();
      session.setPlaying(false);
      sendResponse({ ok: true });
      return false;
    case 'session':
      session.configure(msg.session);
      sendResponse({ ok: true });
      return false;
    case 'chime':
      player.chime(msg.kind, msg.volume);
      sendResponse({ ok: true });
      return false;
    case 'volume':
      player.setVolume(msg.volume);
      sendResponse({ ok: true });
      return false;
    case 'status':
      sendResponse({ ...player.status(), mediaSession: session.claimed, mediaSessionState: session.playbackState });
      return false;
  }
});
