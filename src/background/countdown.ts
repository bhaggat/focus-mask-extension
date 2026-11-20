/**
 * Drives the 5 s break heads-up inside the worker: a 1 s tick for the badge digits and a
 * single onDone at `at`. onDone performs the transition itself, so a late or lost main alarm
 * can't leave the countdown hanging (the transition handlers are idempotent).
 */
export class CountdownTicker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private onTick: () => void,
    private onDone: () => void,
  ) {}

  get active() {
    return this.timeout !== null;
  }

  start(at: number) {
    this.stop();
    this.interval = setInterval(this.onTick, 1000);
    this.timeout = setTimeout(
      () => {
        this.stop();
        this.onDone();
      },
      Math.max(0, at - Date.now()),
    );
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.timeout) clearTimeout(this.timeout);
    this.interval = null;
    this.timeout = null;
  }
}
