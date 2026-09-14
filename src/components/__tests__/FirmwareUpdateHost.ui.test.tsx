import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import FirmwareUpdateHost from '../FirmwareUpdateHost';
import { renderWithProviders } from '../../test/render';
import { seedDeviceStore } from '../../test/store';
import {
  resetFirmwareUpdateStoreForTests,
  useFirmwareUpdateStore,
} from '../../store/useFirmwareUpdateStore';

const { startAutoCheck, showMainWindow } = vi.hoisted(() => ({
  startAutoCheck: vi.fn(async () => undefined),
  showMainWindow: vi.fn(async () => undefined),
}));

vi.mock('../../store/useFirmwareUpdateStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/useFirmwareUpdateStore')>();
  return {
    ...actual,
    startAutoCheck,
    bindAutoUpdateFWPrefListeners: () => () => undefined,
    abortFirmwareUpdateFetches: vi.fn(),
  };
});


describe('FirmwareUpdateHost', () => {
  beforeEach(() => {
    resetFirmwareUpdateStoreForTests();
    startAutoCheck.mockClear();
    showMainWindow.mockClear();
    Object.assign(window, { electronAPI: { isDesktop: true, isElectron: true, showMainWindow } });
    seedDeviceStore({
      isConnected: false,
      isLocked: true,
      isWorking: false,
      isBootloader: false,
      isInitialized: true,
      version: '',
      setupOccupiesFirmwarePrompt: false,
    });
  });

  afterEach(() => {
    resetFirmwareUpdateStoreForTests();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  it('shows the dialog when firmware is available and the PIN is not up', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isWorking: false,
      isBootloader: false,
      version: 'v2.1.2 STD',
      setupOccupiesFirmwarePrompt: false,
    });
    useFirmwareUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      currentVersion: 'v2.1.2 STD',
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.getByTestId('firmware-update-dialog')).toBeInTheDocument();
  });

  it('hides the dialog while the lock-screen PIN is showing and does not dismiss', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isWorking: false,
      isBootloader: false,
      version: 'v2.1.2 STD',
      setupOccupiesFirmwarePrompt: false,
    });
    useFirmwareUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      currentVersion: 'v2.1.2 STD',
      blocks: ['aa'],
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'available',
      promptVisible: true,
      blocks: ['aa'],
    });
    expect(startAutoCheck).not.toHaveBeenCalled();
  });

  it('hides the dialog while a device job is running', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isWorking: true,
      isBootloader: false,
      version: 'v2.1.2 STD',
    });
    useFirmwareUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      currentVersion: 'v2.1.2 STD',
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();
  });

  it('asks the shell to show the main window when the dialog opens', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isWorking: false,
      isBootloader: false,
      version: 'v2.1.2 STD',
      setupOccupiesFirmwarePrompt: false,
    });
    useFirmwareUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      currentVersion: 'v2.1.2 STD',
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(showMainWindow).toHaveBeenCalled();
  });

  it('starts auto-check after unlock, not while locked', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isWorking: false,
      isBootloader: false,
      isInitialized: true,
      version: 'v2.1.2 STD',
      setupOccupiesFirmwarePrompt: false,
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(startAutoCheck).not.toHaveBeenCalled();

    act(() => {
      seedDeviceStore({ isLocked: false });
    });
    expect(startAutoCheck).toHaveBeenCalled();
  });

  it('does not fetch or show a dialog when uninitialized Setup occupies the prompt', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isWorking: false,
      isBootloader: false,
      isInitialized: false,
      version: '',
      setupOccupiesFirmwarePrompt: true,
    });
    useFirmwareUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      currentVersion: '',
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();
    expect(startAutoCheck).not.toHaveBeenCalled();
  });

  it('allows the dialog on Setup Step 1 landing', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isWorking: false,
      isBootloader: false,
      isInitialized: false,
      version: '',
      setupOccupiesFirmwarePrompt: false,
    });
    useFirmwareUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      currentVersion: '',
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.getByTestId('firmware-update-dialog')).toBeInTheDocument();
    expect(startAutoCheck).toHaveBeenCalled();
  });

  it('dismisses and drops RAM blocks on unplug after a connected session', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isWorking: false,
      isBootloader: false,
      version: 'v2.1.2 STD',
      setupOccupiesFirmwarePrompt: false,
    });
    useFirmwareUpdateStore.setState({
      phase: 'ready',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      blocks: ['aa'],
      sha256: 'abc',
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.getByTestId('firmware-update-dialog')).toBeInTheDocument();

    act(() => {
      seedDeviceStore({ isConnected: false });
    });
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      promptVisible: false,
      blocks: null,
    });
  });

  it('does not show the firmware dialog while disconnected', () => {
    seedDeviceStore({
      isConnected: false,
      isLocked: true,
      isWorking: false,
      isBootloader: false,
      version: '',
      setupOccupiesFirmwarePrompt: false,
    });
    useFirmwareUpdateStore.setState({
      phase: 'error',
      promptVisible: true,
      error: 'Could not reach the firmware server.',
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();
  });
});
