import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/popup/App';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { initialState } from '../src/shared/state';
import type { RuntimeState } from '../src/shared/types';
import { chromeMock, emitStorageChange } from './setup';

function mockSnapshot(state: Partial<RuntimeState> = {}, settings = {}) {
  const snap = { state: { ...initialState('brown', true), ...state }, settings: { ...DEFAULT_SETTINGS, ...settings } };
  chromeMock.runtime.sendMessage.mockResolvedValue(snap);
  return snap;
}

describe('popup', () => {
  it('volume slider follows synced volume', async () => {
    mockSnapshot({}, { volume: 0.5 });
    render(<App />);
    const slider = await screen.findByRole('slider', { name: 'Volume' });
    expect(slider).toHaveValue('0.5');
    act(() => emitStorageChange({ volume: { newValue: 0.2 } }, 'sync'));
    expect(slider).toHaveValue('0.2');
  });

  it('live volume is sent at most once per frame', async () => {
    mockSnapshot();
    render(<App />);
    const slider = await screen.findByRole('slider', { name: 'Volume' });
    chromeMock.runtime.sendMessage.mockClear();
    for (const v of ['0.1', '0.2', '0.3', '0.4', '0.6']) fireEvent.change(slider, { target: { value: v } });
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    const volumeCalls = chromeMock.runtime.sendMessage.mock.calls.filter(([m]) => m.type === 'volume');
    expect(volumeCalls).toEqual([[{ type: 'volume', volume: 0.6 }]]);
  });

  it('shows the current sound and paused status, and toggles on click', async () => {
    mockSnapshot();
    render(<App />);
    expect(await screen.findByTestId('sound-name')).toHaveTextContent('Brown noise');
    expect(screen.getByTestId('status')).toHaveTextContent('Paused');
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'toggle' });
  });

  it('reacts to state pushed through storage.session', async () => {
    const snap = mockSnapshot();
    render(<App />);
    await screen.findByTestId('sound-name');
    act(() =>
      emitStorageChange({ runtime: { newValue: { ...snap.state, manual: false, tabAudible: true } } }, 'session'),
    );
    expect(screen.getByTestId('status')).toHaveTextContent('another tab is playing audio');
  });

  it('shows a break countdown with an end-break button', async () => {
    mockSnapshot({ manual: false, breakActive: true, breakEndsAt: Date.now() + 125_000 }, { breakEnabled: true });
    render(<App />);
    expect(await screen.findByTestId('status')).toHaveTextContent(/resumes in 2:0[45]/);
    await userEvent.click(screen.getByRole('button', { name: /End break/ }));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'endBreak' });
  });

  it('announces the countdown before a break pauses the sound', async () => {
    mockSnapshot({ manual: false, countdown: { kind: 'pause', at: Date.now() + 4000 } }, { breakEnabled: true });
    render(<App />);
    expect(await screen.findByTestId('status')).toHaveTextContent('Pausing for a break in 4s');
  });

  it('announces the countdown before the sound resumes after a break', async () => {
    mockSnapshot(
      { manual: false, breakActive: true, breakEndsAt: Date.now() + 3000, countdown: { kind: 'resume', at: Date.now() + 3000 } },
      { breakEnabled: true },
    );
    render(<App />);
    expect(await screen.findByTestId('status')).toHaveTextContent('Resuming in 3s');
  });

  it('restarts the break timer from the popup', async () => {
    mockSnapshot({ nextBreakAt: Date.now() + 20 * 60_000 }, { breakEnabled: true });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Restart break timer' }));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'restartBreakTimer' });
  });

  it('changes the break length from the popup', async () => {
    mockSnapshot({ nextBreakAt: Date.now() + 20 * 60_000 }, { breakEnabled: true, breakLengthMin: 5 });
    render(<App />);
    const group = await screen.findByRole('group', { name: 'Break length' });
    await userEvent.click(within(group).getByRole('button', { name: '10 min' }));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'settings', patch: { breakLengthMin: 10 } });
  });

  it('hides break controls while breaks are off', async () => {
    mockSnapshot();
    render(<App />);
    await screen.findByTestId('sound-name');
    expect(screen.queryByRole('button', { name: 'Restart break timer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Break length' })).not.toBeInTheDocument();
    expect(screen.getByText('Breaks off')).toBeInTheDocument();
  });

  it('sets a custom sleep timer', async () => {
    mockSnapshot({ manual: false });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Custom sleep timer' }));
    const input = screen.getByRole('spinbutton', { name: 'Sleep timer minutes' });
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '720');
    await userEvent.clear(input);
    await userEvent.type(input, '45{Enter}');
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'sleepTimer', minutes: 45 });
  });

  it('selecting a tile plays that sound', async () => {
    mockSnapshot();
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Rain/ }));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'select', soundId: 'rain', play: true });
  });

  it('auto-pause switch sends a settings patch and shows the shortcut', async () => {
    mockSnapshot();
    render(<App />);
    await userEvent.click(await screen.findByRole('switch', { name: /Auto-pause/ }));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'settings', patch: { autoPause: false } });
    await waitFor(() => expect(screen.getByText('Alt+Shift+M')).toBeInTheDocument());
  });

  it('sleep timer chips start and cancel the timer; active timer shows a countdown', async () => {
    mockSnapshot({ manual: false });
    const { unmount } = render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pause after 30 minutes' }));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'sleepTimer', minutes: 30 });
    unmount();

    mockSnapshot({ manual: false, sleepEndsAt: Date.now() + 61_000, sleepMin: 30 });
    render(<App />);
    expect(await screen.findByTestId('sleep-status')).toHaveTextContent(/Pauses in 1:0[01]/);
    const active = screen.getByRole('button', { name: 'Cancel 30 minutes sleep timer' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(active);
    expect(chromeMock.runtime.sendMessage).toHaveBeenLastCalledWith({ type: 'sleepTimer', minutes: null });
  });

  it('explains a screen-lock pause', async () => {
    mockSnapshot({ manual: false, screenLocked: true });
    render(<App />);
    expect(await screen.findByTestId('status')).toHaveTextContent('screen locked');
  });
});
