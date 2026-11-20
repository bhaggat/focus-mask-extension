import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const storageListeners = new Set<Listener>();

export const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    openOptionsPage: vi.fn(),
    getManifest: () => ({ version: '1.0.0' }),
    getURL: (p: string) => `chrome-extension://test/${p}`,
  },
  storage: {
    onChanged: {
      addListener: (l: Listener) => storageListeners.add(l),
      removeListener: (l: Listener) => storageListeners.delete(l),
    },
  },
  commands: { getAll: vi.fn(async () => [{ name: 'toggle-playback', shortcut: 'Alt+Shift+M' }]) },
  tabs: { create: vi.fn() },
};

export function emitStorageChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  for (const l of storageListeners) l(changes, area);
}

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
