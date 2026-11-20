import { describe, expect, it } from 'vitest';
import { statusLabel } from '../src/shared/labels';
import { soundDisplayName } from '../src/shared/sounds';

describe('statusLabel', () => {
  it('gives long labels by default', () => {
    expect(statusLabel('playing')).toBe('Playing');
    expect(statusLabel('paused')).toBe('Paused');
    expect(statusLabel('auto-tab')).toBe('Auto-paused — another tab is playing audio');
    expect(statusLabel('away')).toBe('Paused — screen locked');
    expect(statusLabel('break')).toBe('On a break');
  });

  it('gives short labels for compact UI', () => {
    expect(statusLabel('auto-tab', 'short')).toBe('Auto-paused');
    expect(statusLabel('away', 'short')).toBe('Screen locked');
    expect(statusLabel('break', 'short')).toBe('On a break');
  });
});

describe('soundDisplayName', () => {
  it('names built-ins, known customs, and unknown customs', () => {
    expect(soundDisplayName('pink', [])).toBe('Pink noise');
    expect(soundDisplayName('custom:a', [{ id: 'custom:a', name: 'Cafe' }])).toBe('Cafe');
    expect(soundDisplayName('custom:zz', [])).toBe('Custom sound');
  });
});
