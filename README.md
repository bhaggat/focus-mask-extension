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
| `npm run site` | assemble the landing site (`site/` + screenshots + icon) → `site-dist/`; deployed to <https://focusmask.bhaggat.in> by `.github/workflows/pages.yml` |
| `npm run zip` | validate `dist/` (manifest, files, no remote code) → `release/focusmask-v<version>.zip` |
| `npm run release` | test + e2e + zip |

First-time E2E setup: `npx playwright install chromium` (branded Chrome ≥137 ignores `--load-extension`).

## Architecture

```
src/background/   service worker — owns state, tab-audio detection (debounced), break alarms, notifications
src/offscreen/    hidden AUDIO_PLAYBACK document — Web Audio player + procedural sound synthesis
src/popup/        toolbar popup (React)
src/options/      library, uploads, auto-pause, breaks, shortcut, FAQ (React)
src/shared/       pure state machine, settings, IndexedDB store, sound catalog, labels, types
src/ui/           shared React components/hooks (NumberChoice, Toggle, useSnapshot…)
site/             static landing site: home, /privacy-policy/, /support/, 404 (no build step, no trackers)
```

- **Pause = set of reasons** (`manual` | `auto-tab` | `away` | `break`), see `src/shared/state.ts`. Plays only when empty. Manual is sticky; pressing play clears everything (overrides an audible tab until it goes quiet; ends an active break early). `away` = screen locked (`chrome.idle`), clears on unlock.
- **Break countdown:** each break alarm has a `*-warn` twin 5 s earlier (`src/background/breaks.ts`). When it fires and the transition is audible (`shouldCountdown`), the worker sets `state.countdown`, the offscreen doc plays a falling (pause) or rising (resume) chime, the badge counts `5…1`, and `CountdownTicker` performs the transition at `at` (idempotent with the main alarm). Play/pause/rescheduling clear it; a countdown that went stale while the worker slept is dropped on wake.
- **Custom sounds** up to 3 min are decoded into an `AudioBuffer` for gapless looping; longer or unknown-length files stream through `<audio loop>` (`src/offscreen/loopMode.ts`).
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
