# FocusMask — Chrome Web Store submission guide

Follow this top to bottom. Each field below has the exact value to paste. Everything you'll upload is in
[`store-assets/`](store-assets/) and [`release/`](release/).

---

## 0. Before you start (about 10 min, one-time)

| Step | What to do |
|---|---|
| 0.1 | **Check the name is free.** Search the Chrome Web Store for "FocusMask". If an extension with that exact name already exists, pick another name and change it in the places listed in [§9](#9-renaming-the-extension). |
| 0.2 | **Host the privacy policy** (gives you the URL needed in §4). Easiest option: create a **public GitHub Gist** → paste the contents of [`store-assets/privacy-policy.html`](store-assets/privacy-policy.html) → name the file `privacy-policy.html`. Then use the free viewer `https://htmlpreview.github.io/?<raw gist URL>`. **Better:** a GitHub repo with Pages turned on (Settings → Pages → Deploy from branch), with the file saved as `privacy/index.html`. URL: `https://<your-github-username>.github.io/<repo>/privacy/`. **Before you upload it, replace both `CONTACT_EMAIL` placeholders** in the file with your support email. |
| 0.3 | **Build the package** (already built, but run this again after any code change): `npm ci && npm run release`. This runs the unit tests and the E2E tests, then writes `release/focusmask-v1.0.0.zip`. |

## 1. Developer account (one-time)

1. Go to <https://chrome.google.com/webstore/devconsole>. Sign in with the Google account that will own the listing. A dedicated account is best, because ownership is hard to transfer later.
2. Accept the developer agreement and pay the **one-time US$5 registration fee**.
3. **Account** tab:
   - **Publisher name:** `FocusMask` (or your own name or brand)
   - **Contact email:** your support email. You must verify it by clicking the link Google sends. Publishing stays blocked until you do.
   - **Trader / non-trader declaration** (required for EU users): if you build this as an individual hobby project and don't make money from it, choose **"Non-trader"**. If you sell things or act as a business, choose **"Trader"** and fill in the address and phone number it asks for. Those details are shown publicly to EU users.
4. Turn on **2-step verification** on the Google account. Publishing requires it.

## 2. Create the item

Developer Dashboard → **+ New item** → upload **`release/focusmask-v1.0.0.zip`**.

The dashboard reads the name, version, description, icons and permissions from the manifest. If the upload fails, see [§10](#10-troubleshooting).

## 3. Store listing tab

### Product details

| Field | Value (paste exactly) |
|---|---|
| **Title** | Comes from the manifest: `FocusMask – Focus Sounds & White Noise` |
| **Summary** | Comes from the manifest: `One-click brown, pink & white noise plus nature sounds that auto-pause when another tab plays audio. Offline & private.` |
| **Description** | Paste the full block from [§3.1](#31-description-paste-as-is) below |
| **Category** | `Productivity` → `Workflow & Planning` (second choice: `Lifestyle` → `Well-being`) |
| **Language** | `English (United States)` |

### 3.1 Description (paste as-is)

```
Block out household chatter, open-office noise and café clatter with one click, and let it step aside on its own when your meeting starts.

FocusMask puts steady masking sound in your toolbar. Click once to play and click again to pause. It keeps playing after you close the popup.

★ AUTO-PAUSE FOR MEETINGS AND VIDEOS
When another browser tab starts playing audio (Google Meet, Zoom or Teams in the browser, YouTube, Spotify Web), FocusMask fades out. It fades back in a couple of seconds after that tab goes quiet. Muted tabs are ignored, and you can turn auto-pause off anytime.

It also fades out when you lock your screen and comes back when you unlock it (you can turn this off).

Honest note: Chrome extensions can only see browser tabs. FocusMask can't detect the Zoom/Teams desktop apps, phone calls, or people talking nearby. For those, use the toolbar button or the keyboard shortcut.

★ 8 BUILT-IN SOUNDS, NO DOWNLOADS
• Brown noise: deep and soft, best for masking voices
• Pink noise: balanced, like steady rain
• White noise: bright, full-spectrum
• Rain, Ocean, Stream, Fireplace, Forest
Every sound is generated on your device and loops seamlessly. FocusMask works fully offline.

★ BRING YOUR OWN SOUNDS
Drag and drop your own MP3, WAV, OGG, FLAC or M4A files (up to 50 MB each), and rename them however you like. They are stored only on your computer and never uploaded.

★ SLEEP TIMER
Stop playback after 15 minutes, 30 minutes, 1 hour or 2 hours. The sound fades out and stays paused.

★ HANDS-FREE CONTROL
Press Alt+Shift+M in any Chrome window to play or pause, without opening the popup. You can change the shortcut at chrome://extensions/shortcuts.

★ OPTIONAL BREAK REMINDERS
Off by default. Turn them on to get a gentle notification every 25–90 minutes (or any custom interval). Your sound pauses for the break and resumes on its own. Snooze or skip in one click. There are no full-screen blockers and no nagging.

★ PRIVATE BY DESIGN
• No accounts, no analytics, no ads, no servers
• No network requests at all
• Doesn't request the "tabs" permission and can't see which sites you visit
• Your settings sync only through your own Chrome profile

HOW TO USE
1. Pin FocusMask: click the puzzle icon in the toolbar, then click the pin.
2. Click the FocusMask icon and press play.
3. Pick a sound and set the volume. That's it.

Made for remote workers, students, open-plan offices and anyone who works with headphones on.
```

### Graphic assets

| Field | Required? | Upload this file | Spec |
|---|---|---|---|
| **Store icon** | Required | [`store-assets/icon/store-icon-128.png`](store-assets/icon/store-icon-128.png) | 128×128 PNG |
| **Screenshots** (upload in this order) | Required, 1–5 | [`1-one-click.png`](store-assets/screenshots/1-one-click.png), [`2-auto-pause.png`](store-assets/screenshots/2-auto-pause.png), [`3-library.png`](store-assets/screenshots/3-library.png), [`4-your-sounds.png`](store-assets/screenshots/4-your-sounds.png), [`5-breaks.png`](store-assets/screenshots/5-breaks.png) | 1280×800 PNG |
| **Small promo tile** | Required | [`store-assets/promo/small-promo-440x280.png`](store-assets/promo/small-promo-440x280.png) | 440×280 PNG |
| **Marquee promo tile** | Optional (needed if Google features the extension) | [`store-assets/promo/marquee-1400x560.png`](store-assets/promo/marquee-1400x560.png) | 1400×560 PNG |
| **Global promo video** | Optional | Leave empty | — |

All screenshots are taken from the real extension UI by `npm run assets`. Run it again after UI changes.

### Additional fields

| Field | Value |
|---|---|
| **Official URL** | Leave as `None`. This option needs a domain verified in Google Search Console, so skip it. |
| **Homepage URL** | Your GitHub repo URL if the repo is public, otherwise leave blank |
| **Support URL** | Your GitHub repo's `/issues` URL, or `mailto:<your support email>` |
| **Mature content** | **No** (leave unchecked) |

## 4. Privacy practices tab

### Single purpose (paste)

```
FocusMask plays ambient masking sound (noise, nature sounds or the user's own audio files) to help the user focus, and automatically pauses it while another browser tab is playing audio or during optional break reminders.
```

### Permission justifications (paste each one into its box)

| Permission | Justification |
|---|---|
| `offscreen` | `Manifest V3 service workers cannot play audio, so the selected ambient sound plays in an offscreen document (reason AUDIO_PLAYBACK). This lets playback continue after the popup closes. The offscreen document contains no UI and loads no remote content.` |
| `storage` | `Saves the user's preferences (selected sound, volume, auto-pause toggle, break-reminder interval) in chrome.storage.sync and the current playback state in chrome.storage.session. Nothing is sent to any server.` |
| `unlimitedStorage` | `Users can upload their own audio files (MP3, WAV, OGG, FLAC or M4A, up to 50 MB each) to use as background sound. These files are stored locally in the extension's IndexedDB, and the default storage quota is too small for typical audio files. Files never leave the device.` |
| `alarms` | `Schedules the optional break reminders (for example every 50 minutes) and the end of each break. chrome.alarms is needed because timers do not survive service-worker suspension.` |
| `notifications` | `Shows the optional break-reminder notification ("Time for a short break") with Snooze and Skip buttons, and a short "Break's over" notice. Break reminders are off by default.` |
| `idle` | `Used only to detect when the user locks their screen (chrome.idle "locked" state) so the ambient sound pauses while they are away and resumes when they unlock. The extension does not track activity or idle time, and nothing is stored or transmitted. The feature can be turned off in the options page.` |

If the dashboard shows a **Host permissions** box, leave it empty. The extension requests none.

### Remote code

**"Are you using remote code?"** → **No, I am not using remote code**

Justification box (if one is shown): `All JavaScript is bundled in the package. The extension makes no network requests.`

### Data usage

**"What user data do you plan to collect from users now or in the future?"** → **leave every box unchecked**:

- ☐ Personally identifiable information
- ☐ Health information
- ☐ Financial and payment information
- ☐ Authentication information
- ☐ Personal communications
- ☐ Location
- ☐ Web history
- ☐ User activity
- ☐ Website content

**Certifications.** Check all three:

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy

**Privacy policy URL:** the URL from step 0.2. For example, `https://<your-github-username>.github.io/<repo>/privacy/`

## 5. Distribution tab

| Field | Value |
|---|---|
| **Payments** | `Free of charge` |
| **Visibility** | `Public` (or `Unlisted` for a soft launch where only people with the link can install) |
| **Distribution regions** | `All regions` |

## 6. Test instructions tab (for the reviewer)

**Username / password:** leave blank (the extension has no login).

**Additional instructions (paste):**

```
No account or setup needed.
1. Click the toolbar icon and press Play. Brown noise starts and keeps playing after the popup closes. It is generated locally with Web Audio inside an offscreen document.
2. Auto-pause: with sound playing, open any YouTube video in another tab. FocusMask pauses after about 1.5 s and resumes a couple of seconds after the video is paused. It reads only Chrome's tab "audible"/"muted" flags, which do not require the "tabs" permission.
3. Options page (gear icon): the built-in sound library, uploading your own audio file (stored locally in IndexedDB), and break reminders (off by default; when on, they use chrome.alarms and chrome.notifications).
4. Keyboard shortcut: Alt+Shift+M toggles play/pause.
5. Sleep timer: in the popup, pick 15m/30m/1h/2h; playback pauses when it runs out (chrome.alarms).
6. Screen lock: with sound playing, lock the computer; the sound pauses and resumes on unlock (chrome.idle "locked" state only).
The extension makes no network requests and contains no remote code.
```

## 7. Submit

1. Click **Save draft** on each tab. Every tab must show a green check.
2. Click **Submit for review**.
3. Under "Publish automatically after review" leave **checked** (or uncheck it to publish manually once approved).
4. Review usually takes **1–3 business days**. New developer accounts and the `unlimitedStorage` permission can sometimes make it take longer. You'll get an email either way.

## 8. Publishing an update later

1. Change the code, then bump **both** `version` in [`package.json`](package.json) and `"version"` in [`public/manifest.json`](public/manifest.json). For example `1.0.1` for fixes and `1.1.0` for features. The zip script refuses to pack if they don't match.
2. `npm run release` runs the tests and builds `release/focusmask-v<version>.zip`.
3. Dashboard → your item → **Package** → **Upload new package** → submit for review.
4. If the UI changed, run `npm run assets` and replace the screenshots.

## 9. Renaming the extension

If "FocusMask" is taken, change it in these places:

- [`public/manifest.json`](public/manifest.json): `name`, `short_name`, `action.default_title`
- UI strings: `grep -rn "FocusMask" src/`. This covers the popup header, options page, welcome card, notifications and HTML `<title>` tags.
- [`scripts/store-assets.mjs`](scripts/store-assets.mjs): the brand text in the images. Then run `npm run build && npm run assets`.
- [`store-assets/privacy-policy.html`](store-assets/privacy-policy.html) and the description in §3.1.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| "Manifest file is invalid" or missing icon on upload | Run `npm run build && npm run zip`. The zip script validates every file the manifest references. Make sure you upload the **zip**, not the `dist` folder. |
| Rejected for "Excessive permissions" | Reply quoting the §4 justifications. The usual question is about `unlimitedStorage`: it's only used for user-uploaded audio stored locally. |
| Rejected for "Misleading functionality" (auto-pause) | The listing, the welcome screen and the options page already state the browser-tab-only limitation. Point the reviewer to the "Honest note" paragraph. |
| Rejected over the privacy policy | Make sure the URL is publicly reachable without logging in, and that the `CONTACT_EMAIL` placeholders were replaced. |
| Shortcut shows "Not set" | Another extension already uses Alt+Shift+M. Users can set their own at `chrome://extensions/shortcuts`. This is expected behavior and not a bug. |

---

### Asset checklist

```
release/focusmask-v1.0.0.zip              → Package upload
store-assets/icon/store-icon-128.png      → Store icon
store-assets/screenshots/1-one-click.png  → Screenshot 1
store-assets/screenshots/2-auto-pause.png → Screenshot 2
store-assets/screenshots/3-library.png    → Screenshot 3
store-assets/screenshots/4-your-sounds.png→ Screenshot 4
store-assets/screenshots/5-breaks.png     → Screenshot 5
store-assets/promo/small-promo-440x280.png→ Small promo tile
store-assets/promo/marquee-1400x560.png   → Marquee promo tile
store-assets/privacy-policy.html          → Host publicly; use the URL in Privacy practices
```
