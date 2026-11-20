# FocusMask (working name) — Design Doc

## Intent & why

Dhruv works from home and loses focus to household noise — guests, family
conversations, phone calls — while wearing headphones for deep work. A
one-click ambient/masking-sound Chrome extension solves this for him, and
the same problem hits remote workers, open-plan office workers, and
people working from cafes generally, so this is being built as a public
Chrome Web Store listing, not a throwaway personal tool.

## Goals

- One-click play/pause of an ambient masking sound from the toolbar.
- A curated, ready-to-play sound library, fully bundled — no network
  dependency, works offline.
- Users can upload and play their own audio files.
- "Smart" auto-pause when another browser tab starts playing audio
  (meeting, music, video), auto-resuming when it goes quiet again —
  toggleable.
- Optional, off-by-default scheduled break reminders.
- Honest in-app documentation of what the auto-detection can and can't
  see, so other users aren't confused when it doesn't catch a desktop
  app or a phone call.
- Clean, low-friction UI: a toolbar popup for everyday use, a fuller
  options page for library/uploads/settings.
- Store-ready: proper manifest, icons, justified permissions, no data
  leaves the device, tested end-to-end before submission.

## Non-goals (v1)

- Detecting desktop apps (Zoom/Teams desktop client), system audio, mic,
  or in-room conversation — not possible for a standard extension without
  a separate native helper app; explicitly out of scope and documented
  as a limitation in the UI.
- Sound mixing/layering — single active sound at a time for v1.
- Cloud sync or accounts — settings may sync via `chrome.storage.sync`
  across a user's own signed-in Chrome instances; there is no backend
  and no cross-user data.
- Mobile support — Chromium desktop browsers only.

## Anti-goals

- Must not feel naggy — the break reminder is opt-in and a plain
  dismissible notification, never a full-screen blocker.
- Must not silently stop playing when the popup closes — background
  playback must be reliable.
- Must not overstate what "smart" detection sees — copy near the toggle
  must be explicit about the browser-tab-only limitation.

## Constraints

- Manifest V3 only (required for new Chrome Web Store listings).
- MV3 service workers aren't persistent, so they can't host a live
  `<audio>` element — playback must live in a `chrome.offscreen`
  document, with the service worker only orchestrating state.
- `chrome.storage.local`'s default quota (~10MB) is too small for
  uploaded audio — needs the `unlimitedStorage` permission with blobs
  kept in IndexedDB, not `chrome.storage`.
- Other-tab detection uses `chrome.tabs.query({audible: true})` /
  `tabs.onUpdated` — requires the `tabs` permission.
- Break scheduling must use `chrome.alarms`, not `setInterval`, since
  timers don't survive service worker suspension.
- All bundled sounds are CC0/royalty-free and shipped inside the
  package — no runtime fetches, for offline reliability and a simpler
  Chrome Web Store review.

## Approaches considered

1. **Tech stack** — TypeScript + React + Vite (`@crxjs/vite-plugin`),
   chosen over vanilla TS because the popup/options surface (library
   grid, upload manager, schedule panel, settings) is rich enough to
   benefit from componentized state; vanilla would get unwieldy fast.
2. **Sound sourcing** — bundled CC0 ambience loops (rain, cafe,
   fireplace, ocean, forest) plus procedurally synthesized white/pink/
   brown noise via Web Audio API, all packaged in the extension.
   Rejected CDN streaming — it would shrink the package but adds a
   hosting dependency and breaks the "works with no network" requirement.
3. **Meeting/media detection** — browser-tab audio state only
   (`chrome.tabs` audible). Rejected a native-messaging helper for
   OS-level detection: confirmed unnecessary since meetings happen in
   the browser only; kept as a documented limitation instead of built.
4. **Sound mixing** — single sound at a time for v1; deferred layering
   to a possible later version.
5. **Break reminder style** — plain dismissible `chrome.notifications`
   message. Rejected a full-screen overlay (too disruptive for a focus
   tool) and a badge-only indicator (too easy to miss).
6. **Break + playback interaction** — pause ambient sound during the
   break window, auto-resume after, reusing the same pause/resume
   plumbing as meeting auto-pause.
7. **Resume behavior** — auto-resume automatically once the triggering
   tab/break ends, using the same pause/resume plumbing for both auto-pause
   and break reminders (they remain two independent toggles — auto-pause
   defaults ON, break reminder defaults OFF — that merely share one
   underlying mechanism, resolved per the pause-composition rule below).
8. **Hotkey scope** — the global play/pause shortcut only needs to work
   while some Chrome window is focused (standard `chrome.commands`),
   not while a non-Chrome app has focus. Rejected a true OS-global
   hotkey: it would restrict the key combo to Ctrl/Cmd+Shift+[0-9] with
   no free choice, for a case (fully alt-tabbed away from Chrome) that
   doesn't match this user's actual workflow.

## Decided feature set (v1)

1. **Toolbar popup** — single-click play/pause that persists across
   popup close, current sound name with a quick-switch icon strip,
   volume slider.
2. **Sound library** — bundled sounds grouped as "Noise" (white/pink/
   brown, synthesized) and "Nature/Ambience" (rain, cafe, fireplace,
   ocean, forest — bundled CC0 loops).
3. **Custom upload** — drag-and-drop or file picker (mp3/wav/ogg),
   stored in IndexedDB (`unlimitedStorage`), listed alongside bundled
   sounds, deletable, with basic size guardrails and a clear error for
   unsupported formats.
4. **Auto-pause/resume** (default **ON**) — pauses when another tab
   becomes audible, resumes automatically when it goes quiet. The
   settings panel, right next to this toggle, explains plainly that it
   only sees browser tabs: Meet / Zoom Web / Teams Web / YouTube /
   Spotify Web are detected; the Zoom/Teams *desktop* app, phone calls,
   and people talking nearby are not. The same note appears in a short
   first-run/FAQ blurb.
5. **Break reminder** (default **OFF**) — configurable interval (e.g.
   30/60/90 min or custom) and break length; fires a dismissible
   notification with Snooze/Dismiss; when enabled, pauses playback for
   the break window and auto-resumes after, via the same mechanism as #4.
6. **Global keyboard shortcut** (`chrome.commands`) for play/pause, so
   playback can be controlled without opening the popup — fits the
   "headphones on, hands-off" use case; rebindable via Chrome's own
   shortcuts page.
7. **Settings persistence** — small preferences (selected sound,
   volume, toggle states, schedule) in `chrome.storage.sync`; audio
   blobs stay local-only in IndexedDB, never synced.
8. **First-run onboarding** — a brief welcome screen in the options page
   covering play/pause, the library, and the auto-pause limitation.

## Pause composition & detection details

A builder-check pass flagged these as architecturally expensive to get
wrong later, so they're settled here rather than left implicit:

- **Pause is a set of reasons, not a boolean.** Track active reasons as
  a set: `manual`, `auto-tab`, `break`. Manual pause is sticky — it is
  only cleared by the user pressing play again, never auto-overridden.
  `auto-tab` and `break` are soft reasons: each clears itself when its
  own trigger ends, and playback only auto-resumes once **no** reason
  remains in the set (so if a meeting and a break overlap, ending the
  meeting alone does not resume playback while the break is still on).
- **Auto-pause fires on any audible tab**, not a site allow-list —
  `chrome.tabs.query({audible:true})` has no concept of which site it
  is, so the mechanism can't be more selective than "some other tab is
  making sound." In-app copy should say exactly that ("pauses whenever
  another browser tab plays audio — e.g. a meeting, a video, music")
  rather than implying it recognizes specific services. A short debounce
  (~1–2s) is applied on both the pause and resume transitions so a
  notification chime or a pre-roll ad doesn't cause a flicker.
- **Break-reminder scheduling is an independent wall-clock timer**,
  decoupled from playback state — it's set via `chrome.alarms` from the
  moment the break-reminder toggle is turned on (and reset after each
  completed/snoozed break), and fires on schedule whether or not ambient
  sound is currently playing. If sound is playing when a break fires, it
  gets the `break` pause reason as above; if it's already paused or
  never started, the reminder still fires but has nothing to do to the
  audio.

## Architecture (shape only — detail left to the builder)

- **`background` service worker** — owns the state machine (current
  sound, playing/paused, auto-pause armed), listens to `chrome.tabs`
  audible events and `chrome.alarms`, talks to the offscreen document
  via `chrome.runtime.sendMessage`.
- **`offscreen` document** — hidden page holding the actual `<audio>`
  element(s)/Web Audio nodes; the only place playback happens; created
  on demand via `chrome.offscreen.createDocument`, torn down when idle.
- **`popup`** — React app: play/pause, quick sound switch, volume.
- **`options` page** — React app: full library, upload manager,
  auto-pause settings + explanation copy, break reminder settings,
  onboarding.
- **`assets/sounds/`** — bundled CC0 loop files, lightly trimmed/
  compressed for seamless looping, with each file's source/license
  recorded in the repo.
- **Testing** — unit tests for the state machine and storage logic
  (Vitest), component tests for popup/options (React Testing Library),
  and a manual end-to-end pass loading the unpacked extension: verify
  play/pause survives popup close, auto-pause/resume against a real
  Meet tab and a YouTube tab, upload/delete survives a browser restart,
  break reminder fires and interacts with playback correctly, and the
  packed build passes Chrome Web Store's automated checks (manifest
  validation, permissions justified, no remote code).

## What's left to the builder

- Exact visual design/styling (clean, minimal, theme-aware default,
  open to adjustment during implementation).
- Final working name/branding/icon — "FocusMask" is a placeholder.
- Sourcing the specific CC0 audio loop files during implementation,
  with license/source noted per file.
