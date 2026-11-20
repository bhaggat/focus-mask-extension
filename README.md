# FocusMask

Chrome (MV3) extension: one-click ambient masking sound that auto-pauses when another browser tab plays audio. Design: [docs/2026-11-20-focus-mask-design.md](docs/2026-11-20-focus-mask-design.md). Store submission: [STORE_SUBMISSION.md](STORE_SUBMISSION.md).

## Commands

| | |
|---|---|
| `npm run build` | typecheck + build to `dist/` (load unpacked from here) |
| `npm run dev` | rebuild on change (reload the extension in `chrome://extensions` after) |
| `npm test` | unit + component tests (Vitest, jsdom) |
| `npm run test:e2e` | build + Playwright E2E against the real extension in Chromium (silent: fake audio sink) |
| `npm run assets` | regenerate store screenshots/promo tiles from the built extension → `store-assets/` |
| `node scripts/icons.mjs` | regenerate `public/icons/*` from `scripts/brand.mjs` |
| `npm run zip` | validate `dist/` (manifest, files, no remote code) → `release/focusmask-v<version>.zip` |
| `npm run release` | test + e2e + zip |

First-time E2E setup: `npx playwright install chromium` (branded Chrome ≥137 ignores `--load-extension`).

## Architecture

```
src/background/   service worker — owns state, tab-audio detection (debounced), break alarms, notifications
src/offscreen/    hidden AUDIO_PLAYBACK document — Web Audio player + procedural sound synthesis
src/popup/        toolbar popup (React)
src/options/      library, uploads, auto-pause, breaks, shortcut, FAQ (React)
src/shared/       pure state machine, settings, IndexedDB store, sound catalog, types
```

- **Pause = set of reasons** (`manual` | `auto-tab` | `away` | `break`), see `src/shared/state.ts`. Plays only when empty. Manual is sticky; pressing play clears everything (overrides an audible tab until it goes quiet; ends an active break early). `away` = screen locked (`chrome.idle`), clears on unlock.
- **Sleep timer** is not a pause reason: a `sleep-timer` alarm sets `manual` when it fires; a manual pause cancels it.
- **Headphone / media keys** (`mediaKeys` setting): the offscreen doc plays a silent looping `<audio>` anchor so Chrome exposes a Media Session to the OS (MPRIS / SMTC / Now Playing); Web Audio alone never gets one. The worker releases it whenever another tab is audible (`state.tabAudible`) so the key reaches that tab, see `src/offscreen/mediaSession.ts`.
- **Toolbar badge/tooltip** mirror the status (`ON` / `II` / `BRK` / `!`), see `src/background/badge.ts`.
- **Worker restarts** reconcile session state with surviving alarms (`reconcileBreaks`, `reconcileSleepTimer`) — an extension reload wipes `storage.session` but not alarms.
- **State flow:** UI → `chrome.runtime.sendMessage` → worker reducer → `chrome.storage.session` (UI subscribes via `storage.onChanged`) → offscreen `play`/`pause`.
- **Settings** in `chrome.storage.sync`; uploaded audio in IndexedDB (`unlimitedStorage`), never synced.

## Deviations from the design doc

- **No bundled audio files.** All 8 built-in sounds are synthesized at runtime (seeded, deterministic, crossfaded loops) — zero licensing/attribution, 106 KB package, fully offline.
- **"Café" replaced by "Stream".** Synthesized crowd chatter sounds fake; users can upload a real café recording.
- **No `tabs` permission.** `audible`/`mutedInfo` are readable without it, so the install prompt shows no "read your browsing history" warning.
