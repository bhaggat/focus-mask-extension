import { act, render, screen, waitFor } from '@testing-library/react';
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
