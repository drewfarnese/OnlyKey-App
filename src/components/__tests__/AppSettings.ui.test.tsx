import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppSettings from '../AppSettings';
import type { StartupSettings } from '../../types/electron-api';

type ChangedCallback = (settings: StartupSettings) => void;

function stubElectronAPI(initial: StartupSettings) {
  let current = { ...initial };
  const changedCallbacks: ChangedCallback[] = [];
  const unsubscribe = vi.fn();
  const api = {
    isElectron: true,
    isDesktop: true,
    getStartupSettings: vi.fn(async () => current),
    setStartupSettings: vi.fn(async (partial: Partial<StartupSettings>) => {
      current = { ...current, ...partial };
      return current;
    }),
    onStartupSettingsChanged: vi.fn((cb: ChangedCallback) => {
      changedCallbacks.push(cb);
      return unsubscribe;
    }),
  };
  (window as { electronAPI?: unknown }).electronAPI = api;
  return {
    api,
    unsubscribe,
    emitChanged: (settings: StartupSettings) => changedCallbacks.forEach((cb) => cb(settings)),
  };
}

afterEach(() => {
  delete (window as { electronAPI?: unknown }).electronAPI;
});

describe('AppSettings', () => {
  it('renders nothing outside the Electron shell', () => {
    render(<AppSettings />);
    expect(screen.queryByTestId('app-settings')).not.toBeInTheDocument();
  });

  it('loads current settings and updates via the main process', async () => {
    const { api } = stubElectronAPI({ launchAtStartup: false, startMinimized: true });
    const user = userEvent.setup();
    render(<AppSettings />);

    const launchBox = await screen.findByRole('checkbox', { name: /launch app at system startup/i });
    const trayBox = screen.getByRole('checkbox', { name: /run minimized in the system tray/i });
    expect(launchBox).not.toBeChecked();
    expect(trayBox).toBeChecked();

    await user.click(launchBox);
    expect(api.setStartupSettings).toHaveBeenCalledWith({ launchAtStartup: true });
    await waitFor(() => expect(launchBox).toBeChecked());
  });

  it('keeps the resulting state when the OS change failed', async () => {
    const { api } = stubElectronAPI({ launchAtStartup: false, startMinimized: false });
    // Main process reverts the stored setting when the login-item change fails
    api.setStartupSettings.mockResolvedValue({ launchAtStartup: false, startMinimized: false });
    const user = userEvent.setup();
    render(<AppSettings />);

    const launchBox = await screen.findByRole('checkbox', { name: /launch app at system startup/i });
    await user.click(launchBox);
    await waitFor(() => expect(launchBox).not.toBeChecked());
  });

  it('mirrors changes made from the tray menu and unsubscribes on unmount', async () => {
    const { unsubscribe, emitChanged } = stubElectronAPI({
      launchAtStartup: false,
      startMinimized: false,
    });
    const { unmount } = render(<AppSettings />);

    const trayBox = await screen.findByRole('checkbox', { name: /run minimized in the system tray/i });
    emitChanged({ launchAtStartup: false, startMinimized: true });
    await waitFor(() => expect(trayBox).toBeChecked());

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
