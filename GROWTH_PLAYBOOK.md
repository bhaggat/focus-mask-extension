# FocusMask — Launch & Store Ranking Playbook

**Chrome Web Store:** <https://chromewebstore.google.com/detail/fbbgelepmidgecbhggehgkldeommhpma>
**Reviews URL:** <https://chromewebstore.google.com/detail/fbbgelepmidgecbhggehgkldeommhpma/reviews>
**Landing Page:** <https://focusmask.bhaggat.in/>

---

## 1. Ready-to-Post Launch Copy

### A. Reddit — `r/ADHD` & `r/productivity`
**Title:**
> I built a free, offline Chrome extension for brown/pink/white noise that auto-pauses when a meeting or video starts (no tracking, no account)

**Body:**
> I use brown noise to block out voices and background chatter while working, but I got tired of forgetting to pause it whenever a Google Meet call or YouTube video started—and then talking over brown noise for 30 seconds.
>
> So I built **FocusMask**:
> - **Auto-pauses for meetings & videos:** When another browser tab starts playing audio (Meet, Zoom web, Teams web, YouTube, Spotify Web), FocusMask fades out and fades back in a couple of seconds after that tab goes quiet.
> - **8 built-in sounds:** Brown, pink, and white noise + Rain, Ocean, Stream, Fireplace, and Forest. Generated locally with Web Audio so everything loops seamlessly and works offline.
> - **Bring your own audio:** Drag & drop MP3/WAV/OGG/FLAC/M4A files (stored locally in IndexedDB, never uploaded).
> - **Private by design:** Zero accounts, zero analytics, zero network requests. It doesn't even ask for the `"tabs"` permission—it only checks Chrome's audible/muted tab state.
> - **Optional break reminders + sleep timer + `Alt+Shift+M` shortcut** (useful if you use desktop Zoom/Teams apps, since extensions can only see browser tabs).
>
> Chrome Web Store: https://chromewebstore.google.com/detail/fbbgelepmidgecbhggehgkldeommhpma
> Landing page: https://focusmask.bhaggat.in/
>
> Happy to hear any feedback or feature requests!

---

### B. Hacker News — `Show HN`
**Title:**
> Show HN: FocusMask – Offline brown/white noise Chrome extension that auto-pauses for meetings

**Body / First Comment:**
> Hi HN,
>
> I built FocusMask, a Manifest V3 Chrome extension that plays masking audio (brown, pink, white noise + 5 synthesized nature sounds, or your own local audio files) and automatically fades out whenever another browser tab starts playing audio.
>
> A few technical details I cared about:
> - **No `"tabs"` permission or host permissions:** It uses `chrome.tabs.query({ audible: true })` (which doesn't require the `"tabs"` permission) to detect when Meet/Zoom-web/YouTube is playing, so it never sees your URLs or browsing history.
> - **100% local Web Audio in an MV3 offscreen document:** All 8 built-in sounds are synthesized locally with no external audio files or network requests. User-uploaded audio stays in IndexedDB.
> - **Zero telemetry:** No analytics, no accounts, no remote code.
>
> Chrome Web Store: https://chromewebstore.google.com/detail/fbbgelepmidgecbhggehgkldeommhpma
> Site: https://focusmask.bhaggat.in/
>
> Would love feedback on the audio synthesis or MV3 architecture.

---

### C. Product Hunt
- **Tagline (<= 60 chars):** `Focus sounds that auto-pause when your meeting starts`
- **Description:**
  > Block out background chatter with one-click brown, pink & white noise or nature sounds—right from your Chrome toolbar. When another tab starts playing audio (Google Meet, Zoom web, YouTube), FocusMask automatically fades out and fades back in once the tab goes quiet. 100% offline, zero tracking, no account required, and supports your own local audio files.
- **Topics:** `Productivity`, `Chrome Extensions`, `Remote Work`, `Privacy`

---

### D. X / Twitter Thread
> 1/ I kept forgetting to pause my brown noise when jumping into Google Meet calls.
>
> So I built FocusMask — a free Chrome extension that plays focus sounds and automatically pauses when another tab plays audio.
>
> Install: https://chromewebstore.google.com/detail/fbbgelepmidgecbhggehgkldeommhpma
>
> 2/ What makes it different:
> - Auto-pauses for Meet, Zoom web & YouTube, then fades back in
> - 8 built-in sounds (Brown, Pink, White, Rain, Ocean, Stream, Fireplace, Forest)
> - Drag & drop your own MP3/FLAC/WAV files
> - 100% offline, zero analytics, doesn't even request the `tabs` permission

---

## 2. 20-Second Promo Video Script (for Chrome Web Store)
Uploading a short video to the **Global promo video** slot in the CWS Developer Console increases install conversion:
1. **0:00–0:04:** Show a noisy workspace / open Chrome window, click the FocusMask icon, press Play on **Brown Noise** (overlay text: *"One-click brown & white noise"*).
2. **0:04–0:10:** Switch to a Google Meet or YouTube tab and start audio → FocusMask badge/UI shows it **auto-paused** (overlay text: *"Auto-pauses when meetings or videos start"*).
3. **0:10–0:15:** Stop the meeting/video tab → FocusMask fades back in automatically (overlay text: *"Fades right back in when you're done"*).
4. **0:15–0:20:** Quick pan of Options page (8 sounds + drag-and-drop custom audio + sleep timer) + final card: *"FocusMask — Free · Offline · Private"*.

---

## 3. Chrome Web Store Console Checklist (for Top Ranking & Badges)
1. **Deploy the updated landing site** (`scripts/site.mjs` now has `STORE_ITEM_ID = 'fbbgelepmidgecbhggehgkldeommhpma'`, plus `site/robots.txt`, `site/sitemap.xml`, and JSON-LD schema). Push to `main` so GitHub Actions updates `https://focusmask.bhaggat.in/`.
2. **Publish `v1.0.1` (or `v1.0.2`) with `_locales`:** The extension now includes `public/_locales/` for `en`, `es`, `pt_BR`, `de`, `fr`, `ja`, `ko`, and `hi`. In the CWS Developer Console, you can also add localized Store Listing descriptions for those languages to rank in non-English CWS searches.
3. **Verify `bhaggat.in` in Google Search Console:** Once verified, set **Official URL** in the CWS Developer Console to `https://focusmask.bhaggat.in` (helps qualify for the **Established Publisher** badge).
4. **Apply for the "Featured" Badge:** Once you have your first 5–10 positive reviews, submit the Chrome Web Store **self-nomination form** for the Featured badge from the Developer Console help/support docs.
5. **Submit to directories:** AlternativeTo (under Noisli / Coffitivity / Brain.fm), SaaSHub, and Chrome-Stats.
