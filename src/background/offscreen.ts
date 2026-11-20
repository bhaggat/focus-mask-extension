import type { OffscreenMessage, OffscreenStatus } from '../shared/types';

const PATH = 'offscreen.html';
const SEND_TIMEOUT_MS = 10_000;
let creating: Promise<void> | null = null;

async function hasDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(PATH)],
  });
  return contexts.length > 0;
}

export async function ensureOffscreen(): Promise<void> {
  if (await hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: PATH,
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Plays the ambient sound the user selected, independent of the popup.',
      })
      .catch((e: unknown) => {
        // Another caller won the race — fine.
        if (!String(e).includes('single offscreen')) throw e;
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

type WithoutTarget<T> = T extends unknown ? Omit<T, 'target'> : never;

export async function sendToOffscreen<R = { ok: boolean; error?: string }>(
  msg: WithoutTarget<OffscreenMessage>,
  { create = false } = {},
): Promise<R | null> {
  if (create) await ensureOffscreen();
  else if (!(await hasDocument())) return null;
  // Never let a stuck offscreen call block the worker's serial queue.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Audio engine did not respond.')), SEND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      chrome.runtime.sendMessage({ ...msg, target: 'offscreen' } as OffscreenMessage) as Promise<R>,
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export const offscreenStatus = () => sendToOffscreen<OffscreenStatus>({ type: 'status' });
