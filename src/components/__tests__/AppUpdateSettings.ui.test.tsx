import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const checkAppUpdate = vi.fn();
vi.mock('../../desktop/updater', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/updater')>();
  return { ...actual, checkAppUpdate: (...args: unknown[]) => checkAppUpdate(...args) };
});

import AppUpdateSettings from '../AppUpdateSettings';
import { renderWithProviders } from '../../test/render';
import { resetAppUpdateStoreForTests, useAppUpdateStore } from '../../store/useAppUpdateStore';

describe('AppUpdateSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    checkAppUpdate.mockReset();
    resetAppUpdateStoreForTests();
  });

  afterEach(() => {
    resetAppUpdateStoreForTests();
  });

  it('shows the running version, the checkbox, and Check now', () => {
    renderWithProviders(<AppUpdateSettings />);
    expect(screen.getByText(new RegExp(`running OnlyKey App ${__APP_VERSION__.replace(/\./g, '\\.')}`))).toBeInTheDocument();
    expect(screen.getByTestId('auto-update-checkbox')).toBeChecked();
    expect(screen.getByTestId('check-now')).toBeEnabled();
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      'https://github.com/drewfarnese/OnlyKey-App/releases/latest',
    );
  });

  it('disables Check now while checking and shows the last error otherwise', () => {
    useAppUpdateStore.setState({ phase: 'checking' });
    const { unmount } = renderWithProviders(<AppUpdateSettings />);
    expect(screen.getByTestId('check-now')).toBeDisabled();
    expect(screen.getByText(/checking for updates/i)).toBeInTheDocument();
    unmount();

    useAppUpdateStore.setState({ phase: 'error', error: 'Could not reach the release server (HTTP 502).' });
    renderWithProviders(<AppUpdateSettings />);
    expect(screen.getByText(/HTTP 502/)).toBeInTheDocument();
  });

  it('toggles the auto-update preference', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppUpdateSettings />);
    await user.click(screen.getByTestId('auto-update-checkbox'));
    expect(useAppUpdateStore.getState().autoCheck).toBe(false);
    expect(localStorage.getItem('autoUpdate')).toBe('false');
  });

  it('runs a forced check from Check now and reports up to date', async () => {
    checkAppUpdate.mockResolvedValue({ kind: 'current', currentVersion: '6.0.0', latestVersion: '6.0.0' });
    const user = userEvent.setup();
    renderWithProviders(<AppUpdateSettings />);
    await user.click(screen.getByTestId('check-now'));
    expect(checkAppUpdate).toHaveBeenCalledWith(expect.anything(), { force: true });
    expect(await screen.findByText(/is up to date/i)).toBeInTheDocument();
  });
});
