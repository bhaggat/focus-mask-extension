import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/options/App';
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
});
