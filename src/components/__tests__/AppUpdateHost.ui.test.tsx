import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const checkAppUpdate = vi.fn();
const openAppUpdateDownload = vi.fn();
vi.mock('../../desktop/updater', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/updater')>();
  return {
    ...actual,
    checkAppUpdate: (...args: unknown[]) => checkAppUpdate(...args),
    openAppUpdateDownload: (...args: unknown[]) => openAppUpdateDownload(...args),
  };
});

import AppUpdateHost from '../AppUpdateHost';
import { renderWithProviders } from '../../test/render';
import { resetAppUpdateStoreForTests, useAppUpdateStore } from '../../store/useAppUpdateStore';
import { seedConnectedClassicLocked, seedDeviceStore } from '../../test/store';

const available = {
  kind: 'available' as const,
  currentVersion: '6.0.0',
  latestVersion: '6.1.0',
  downloadUrl: 'https://github.com/drewfarnese/OnlyKey-App/releases/download/v6.1.0/OnlyKey_6.1.0.exe',
  releaseUrl: 'https://github.com/drewfarnese/OnlyKey-App/releases/tag/v6.1.0',
};

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('AppUpdateHost', () => {
  beforeEach(() => {
    localStorage.clear();
    checkAppUpdate.mockReset();
    openAppUpdateDownload.mockReset();
    resetAppUpdateStoreForTests();
  });

  afterEach(() => {
    resetAppUpdateStoreForTests();
  });

  it('starts the automatic check after mount and shows the dialog when an update exists', async () => {
    checkAppUpdate.mockResolvedValue(available);
    renderWithProviders(<AppUpdateHost />);
    await flush();
    expect(checkAppUpdate).toHaveBeenCalledWith(expect.anything(), { force: false });
    const dialog = await screen.findByTestId('app-update-dialog');
    expect(dialog).toHaveTextContent(/Version 6\.1\.0 is available/);
    expect(dialog).toHaveTextContent(/You have 6\.0\.0/);
  });

  it('Download opens the installer in the browser and closes the dialog', async () => {
    checkAppUpdate.mockResolvedValue(available);
    openAppUpdateDownload.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<AppUpdateHost />);
    await flush();
    await user.click(await screen.findByRole('button', { name: /download/i }));
    expect(openAppUpdateDownload).toHaveBeenCalledWith(available.downloadUrl);
    expect(screen.queryByTestId('app-update-dialog')).not.toBeInTheDocument();
  });

  it('offers the release page when no installer matches this platform', async () => {
    checkAppUpdate.mockResolvedValue({ ...available, downloadUrl: null });
    renderWithProviders(<AppUpdateHost />);
    await flush();
    expect(await screen.findByRole('button', { name: /open release page/i })).toBeInTheDocument();
  });

  it('Later dismisses the dialog', async () => {
    checkAppUpdate.mockResolvedValue(available);
    const user = userEvent.setup();
    renderWithProviders(<AppUpdateHost />);
    await flush();
    await user.click(await screen.findByRole('button', { name: /later/i }));
    expect(screen.queryByTestId('app-update-dialog')).not.toBeInTheDocument();
    expect(useAppUpdateStore.getState().phase).toBe('available');
  });

  it('defers the dialog while a locked device or a device operation is on screen', async () => {
    checkAppUpdate.mockResolvedValue(available);
    seedConnectedClassicLocked();
    renderWithProviders(<AppUpdateHost />);
    await flush();
    expect(useAppUpdateStore.getState().promptVisible).toBe(true);
    expect(screen.queryByTestId('app-update-dialog')).not.toBeInTheDocument();

    act(() => seedDeviceStore({ isLocked: false }));
    expect(screen.getByTestId('app-update-dialog')).toBeInTheDocument();

    act(() => seedDeviceStore({ isWorking: true }));
    expect(screen.queryByTestId('app-update-dialog')).not.toBeInTheDocument();
  });

  it('shows failures only for a user-initiated check', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    checkAppUpdate.mockRejectedValue(new Error('offline'));
    renderWithProviders(<AppUpdateHost />);
    await flush();
    expect(screen.queryByTestId('app-update-dialog')).not.toBeInTheDocument();

    act(() => useAppUpdateStore.setState({ phase: 'error', error: 'App update check failed.', promptVisible: true }));
    expect(screen.getByTestId('app-update-dialog')).toHaveTextContent(/failed/);
  });

  it('does not start a check when the preference is off', async () => {
    localStorage.setItem('autoUpdate', 'false');
    renderWithProviders(<AppUpdateHost />);
    await flush();
    expect(checkAppUpdate).not.toHaveBeenCalled();
  });
});
