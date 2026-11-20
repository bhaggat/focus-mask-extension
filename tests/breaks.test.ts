import { beforeEach, describe, expect, it } from 'vitest';
import { clearBreakAlarms, ensureWarnAlarms, scheduleBreakEnd, scheduleNextBreak } from '../src/background/breaks';
import { resetAlarms } from './setup';

const all = async () =>
  Object.fromEntries((await chrome.alarms.getAll()).map((a) => [a.name, a.scheduledTime]));

describe('break alarms', () => {
  beforeEach(() => resetAlarms());

  it('schedules a warning alarm 5 s before the break and before its end', async () => {
    await scheduleNextBreak(30, 0);
    await scheduleBreakEnd(1, 0);
    expect(await all()).toEqual({
      'break-start': 1_800_000,
      'break-warn': 1_795_000,
      'break-end': 60_000,
      'break-end-warn': 55_000,
    });
  });

  it('clearBreakAlarms removes all four', async () => {
    await scheduleNextBreak(30, 0);
    await scheduleBreakEnd(5, 0);
    await clearBreakAlarms();
    expect(await chrome.alarms.getAll()).toEqual([]);
  });

  it('ensureWarnAlarms restores a missing warning only when there is time for it', async () => {
    await chrome.alarms.create('break-end', { when: 60_000 });
    await chrome.alarms.create('break-start', { when: 3000 });
    await ensureWarnAlarms(0);
    expect(await all()).toEqual({ 'break-end': 60_000, 'break-end-warn': 55_000, 'break-start': 3000 });
  });
});
