/**
 * Detects "some other browser tab is making sound". `audible` and `mutedInfo`
 * are readable without the `tabs` permission. Muted tabs are ignored. Our own
 * playback lives in an offscreen document, which is not a tab, so it never
 * triggers this.
 */
export const PAUSE_DEBOUNCE_MS = 1500;
export const RESUME_DEBOUNCE_MS = 2000;

export async function anyAudibleTab(): Promise<boolean> {
  const tabs = await chrome.tabs.query({ audible: true });
  return tabs.some((t) => !t.mutedInfo?.muted);
}

/**
 * Debounces raw audible readings into stable transitions. A brief chime or
 * pre-roll blip never flips state; both directions need a sustained reading.
 */
export class AudibleDebouncer {
  private stable: boolean;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: boolean | null = null;

  constructor(
    initial: boolean,
    private onChange: (audible: boolean) => void,
    private delays = { pause: PAUSE_DEBOUNCE_MS, resume: RESUME_DEBOUNCE_MS },
  ) {
    this.stable = initial;
  }

  get value() {
    return this.stable;
  }

  push(raw: boolean) {
    if (raw === this.stable) {
      this.cancel();
      return;
    }
    if (this.pending === raw) return;
    this.cancel();
    this.pending = raw;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.pending = null;
        this.stable = raw;
        this.onChange(raw);
      },
      raw ? this.delays.pause : this.delays.resume,
    );
  }

  private cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
