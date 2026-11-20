import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/options/App';
import { deleteCustomSound, getCustomSound, putCustomSound } from '../src/shared/db';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { initialState } from '../src/shared/state';
import { chromeMock } from './setup';

function mockSnapshot(settings = {}) {
  chromeMock.runtime.sendMessage.mockResolvedValue({
    state: initialState('brown', true),
    settings: { ...DEFAULT_SETTINGS, ...settings },
  });
}

describe('options page', () => {
  it('shows onboarding until dismissed', async () => {
    mockSnapshot({ onboarded: false });
    render(<App />);
    expect(await screen.findByText('Welcome to FocusMask')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Got it/ }));
    expect(screen.queryByText('Welcome to FocusMask')).not.toBeInTheDocument();
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'settings', patch: { onboarded: true } });
  });

  it('explains the browser-tab-only limitation next to the toggle', async () => {
    mockSnapshot({ onboarded: true });
    render(<App />);
    expect(await screen.findByText(/What it can’t see:/)).toBeInTheDocument();
    expect(screen.getByText(/desktop apps/)).toBeInTheDocument();
  });

  it('shows the version and a developer credit link in the footer', async () => {
    mockSnapshot({ onboarded: true });
    render(<App />);
    expect(await screen.findByText(/FocusMask v1\.0\.0/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Dhruv Bhagat' });
    expect(link).toHaveAttribute('href', 'https://www.bhaggat.in/');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('toggles headphone / media key control', async () => {
    mockSnapshot({ onboarded: true });
    render(<App />);
    const toggle = await screen.findByRole('switch', { name: 'Control with headphone and media keys' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'settings', patch: { mediaKeys: false } });
  });

  it('break interval chips update settings', async () => {
    mockSnapshot({ onboarded: true, breakEnabled: true });
    render(<App />);
    const group = await screen.findByRole('group', { name: 'Break interval' });
    await userEvent.click(group.querySelector('button')!);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'settings', patch: { breakIntervalMin: 25 } });
  });

  it('rejects unsupported uploads with a clear error', async () => {
    mockSnapshot({ onboarded: true });
    render(<App />);
    const input = await screen.findByTestId('upload-input');
    const bad = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, bad, { applyAccept: false });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/isn't a supported format/));
  });

  it('custom break interval commits on Enter and is clamped', async () => {
    mockSnapshot({ onboarded: true, breakEnabled: true });
    render(<App />);
    const group = await screen.findByRole('group', { name: 'Break interval' });
    await userEvent.click(within(group).getByRole('button', { name: 'Custom' }));
    const input = within(group).getByLabelText('Break interval (custom)');
    await userEvent.clear(input);
    await userEvent.type(input, '500{Enter}');
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'settings', patch: { breakIntervalMin: 240 } });
    expect(input).toHaveValue(240);
  });

  it('break settings are inert (not keyboard-reachable) while reminders are off', async () => {
    mockSnapshot({ onboarded: true, breakEnabled: false });
    render(<App />);
    const group = await screen.findByRole('group', { name: 'Break interval' });
    expect(group.closest('.o-break-config')).toHaveAttribute('inert');
  });

  it('accepts the wider set of audio formats in the file picker', async () => {
    mockSnapshot({ onboarded: true });
    render(<App />);
    const accept = (await screen.findByTestId('upload-input')).getAttribute('accept')!;
    for (const ext of ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.opus']) expect(accept).toContain(ext);
  });

  it('screen-lock toggle updates settings', async () => {
    mockSnapshot({ onboarded: true });
    render(<App />);
    const t = await screen.findByRole('switch', { name: 'Pause while your screen is locked' });
    expect(t).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(t);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'settings', patch: { pauseOnLock: false } });
  });

  it('renames an uploaded sound inline (Enter saves, Escape cancels)', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/wav' });
    await putCustomSound({ id: 'custom:ren', name: 'take 3 final', type: 'audio/wav', size: 1, duration: 4, createdAt: 1, blob });
    mockSnapshot({ onboarded: true });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename take 3 final' }));
    const input = screen.getByRole('textbox', { name: 'New name for take 3 final' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Thunderstorm{Enter}');
    expect(await screen.findByText('Thunderstorm')).toBeInTheDocument();
    expect((await getCustomSound('custom:ren'))?.name).toBe('Thunderstorm');

    await userEvent.click(screen.getByRole('button', { name: 'Rename Thunderstorm' }));
    await userEvent.type(screen.getByRole('textbox'), ' nope{Escape}');
    expect(screen.getByText('Thunderstorm')).toBeInTheDocument();
    expect((await getCustomSound('custom:ren'))?.name).toBe('Thunderstorm');
    await deleteCustomSound('custom:ren');
  });
});
