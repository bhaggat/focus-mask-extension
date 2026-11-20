import type { OffscreenMessage } from '../shared/types';
import { Player } from './player';

const player = new Player();

chrome.runtime.onMessage.addListener((msg: OffscreenMessage, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  switch (msg.type) {
    case 'play':
      player
        .play(msg.soundId, msg.volume)
        .then(() => sendResponse({ ok: true }))
        .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      return true;
    case 'pause':
      player.pause();
      sendResponse({ ok: true });
      return false;
    case 'volume':
      player.setVolume(msg.volume);
      sendResponse({ ok: true });
      return false;
    case 'status':
      sendResponse(player.status());
      return false;
  }
});
