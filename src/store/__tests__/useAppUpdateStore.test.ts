import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { AppUpdateError } from '../../desktop/updater';
import { AUTO_UPDATE_PREF_EVENT, userPreferences } from '../../desktop/userPreferences';
import {
  appUpdateUserMessage,
  bindAutoUpdatePrefListeners,
  checkNow,
  dismissUpdatePrompt,
  openDownload,
  resetAppUpdateStoreForTests,
  setAutoCheck,
  startAutoCheck,
  useAppUpdateStore,
} from '../useAppUpdateStore';

const available = {
  kind: 'available' as const,
  currentVersion: '6.0.0',
  latestVersion: '6.1.0',
  downloadUrl: 'https://github.com/drewfarnese/OnlyKey-App/releases/download/v6.1.0/OnlyKey_6.1.0.exe',
  releaseUrl: 'https://github.com/drewfarnese/OnlyKey-App/releases/tag/v6.1.0',
};

describe('useAppUpdateStore', () => {
  beforeEach(() => {
    localStorage.clear();
    checkAppUpdate.mockReset();
    openAppUpdateDownload.mockReset();
    resetAppUpdateStoreForTests();
  });

  afterEach(() => {
    resetAppUpdateStoreForTests();
  });

  it('maps error codes to user copy', () => {
    expect(appUpdateUserMessage('http-release', 502)).toMatch(/HTTP 502/);
    expect(appUpdateUserMessage('http-release')).toMatch(/release server/);
    expect(appUpdateUserMessage('invalid-release')).toMatch(/could not be read/);
    expect(appUpdateUserMessage('host-not-allowed')).toMatch(/refused/);
    expect(appUpdateUserMessage('io')).toMatch(/failed/);
  });

  it('does not run an automatic check when the preference is off', async () => {
    userPreferences.autoUpdate = false;
    await startAutoCheck();
    expect(checkAppUpdate).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState().phase).toBe('idle');
  });

  it('presents an available update from the automatic check', async () => {
    checkAppUpdate.mockResolvedValue(available);
    await startAutoCheck();
    expect(checkAppUpdate).toHaveBeenCalledWith(expect.anything(), { force: false });
    expect(useAppUpdateStore.getState()).toMatchObject({
      phase: 'available',
      promptVisible: true,
      latestVersion: '6.1.0',
      downloadUrl: available.downloadUrl,
    });
  });

  it('stays quiet when current on an automatic check, but reports it on Check now', async () => {
    checkAppUpdate.mockResolvedValue({ kind: 'current', currentVersion: '6.0.0', latestVersion: '6.0.0' });
    await startAutoCheck();
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'idle', promptVisible: false });

    await checkNow();
    expect(checkAppUpdate).toHaveBeenLastCalledWith(expect.anything(), { force: true });
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'up-to-date', promptVisible: true });
  });

  it('logs a failed automatic check without a modal, and shows one for Check now', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkAppUpdate.mockRejectedValue(new AppUpdateError('HTTP 503', 'http-release', 503));
    await startAutoCheck();
    expect(useAppUpdateStore.getState()).toMatchObject({
      phase: 'error',
      promptVisible: false,
      errorCode: 'http-release',
    });
    expect(error).toHaveBeenCalled();

    await checkNow();
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'error', promptVisible: true });
    expect(useAppUpdateStore.getState().error).toMatch(/HTTP 503/);
  });

  it('wraps unknown failures as io errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    checkAppUpdate.mockRejectedValue(new Error('boom'));
    await checkNow();
    expect(useAppUpdateStore.getState().errorCode).toBe('io');
  });

  it('opens the installer and closes the prompt', async () => {
    checkAppUpdate.mockResolvedValue(available);
    openAppUpdateDownload.mockResolvedValue(undefined);
    await checkNow();
    await openDownload();
    expect(openAppUpdateDownload).toHaveBeenCalledWith(available.downloadUrl);
    expect(useAppUpdateStore.getState().promptVisible).toBe(false);
  });

  it('falls back to the release page when no installer matches', async () => {
    checkAppUpdate.mockResolvedValue({ ...available, downloadUrl: null });
    openAppUpdateDownload.mockResolvedValue(undefined);
    await checkNow();
    await openDownload();
    expect(openAppUpdateDownload).toHaveBeenCalledWith(available.releaseUrl);
  });

  it('surfaces a refused download URL as an error', async () => {
    checkAppUpdate.mockResolvedValue(available);
    openAppUpdateDownload.mockRejectedValue(new AppUpdateError('nope', 'host-not-allowed'));
    await checkNow();
    await openDownload();
    expect(useAppUpdateStore.getState()).toMatchObject({ phase: 'error', errorCode: 'host-not-allowed', promptVisible: true });
  });

  it('ignores openDownload outside the available phase', async () => {
    await openDownload();
    expect(openAppUpdateDownload).not.toHaveBeenCalled();
  });

  it('dismisses the prompt', async () => {
    checkAppUpdate.mockResolvedValue(available);
    await checkNow();
    dismissUpdatePrompt();
    expect(useAppUpdateStore.getState().promptVisible).toBe(false);
  });

  it('runs one check at a time', async () => {
    let resolve!: (v: unknown) => void;
    checkAppUpdate.mockReturnValue(new Promise((r) => { resolve = r; }));
    const first = checkNow();
    await checkNow();
    expect(checkAppUpdate).toHaveBeenCalledTimes(1);
    resolve({ kind: 'current', currentVersion: '6.0.0', latestVersion: '6.0.0' });
    await first;
  });

  it('turning the preference on starts a check and persists it', async () => {
    userPreferences.autoUpdate = false;
    resetAppUpdateStoreForTests();
    checkAppUpdate.mockResolvedValue({ kind: 'current', currentVersion: '6.0.0', latestVersion: '6.0.0' });
    setAutoCheck(true);
    expect(localStorage.getItem('autoUpdate')).toBe('true');
    await Promise.resolve();
    await Promise.resolve();
    expect(checkAppUpdate).toHaveBeenCalledTimes(1);

    setAutoCheck(false);
    expect(useAppUpdateStore.getState().autoCheck).toBe(false);
    expect(localStorage.getItem('autoUpdate')).toBe('false');
  });

  it('re-hydrates from the preference event and on focus', async () => {
    userPreferences.autoUpdate = false;
    resetAppUpdateStoreForTests();
    checkAppUpdate.mockResolvedValue({ kind: 'current', currentVersion: '6.0.0', latestVersion: '6.0.0' });
    const unbind = bindAutoUpdatePrefListeners();
    expect(useAppUpdateStore.getState().autoCheck).toBe(false);

    localStorage.setItem('autoUpdate', 'true');
    window.dispatchEvent(new Event(AUTO_UPDATE_PREF_EVENT));
    expect(useAppUpdateStore.getState().autoCheck).toBe(true);
    await Promise.resolve();
    expect(checkAppUpdate).toHaveBeenCalledTimes(1);

    localStorage.setItem('autoUpdate', 'false');
    window.dispatchEvent(new Event('focus'));
    expect(useAppUpdateStore.getState().autoCheck).toBe(false);

    unbind();
    localStorage.setItem('autoUpdate', 'true');
    window.dispatchEvent(new Event('focus'));
    expect(useAppUpdateStore.getState().autoCheck).toBe(false);
  });
});
