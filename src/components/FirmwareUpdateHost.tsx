import React, { useEffect, useRef } from 'react';
import {
  bindAutoUpdateFWPrefListeners,
  isSafeFirmwareCheckMoment,
  resetOnDisconnect,
  startAutoCheck,
  useFirmwareUpdateStore,
  type FirmwareUpdatePhase,
} from '../store/useFirmwareUpdateStore';
import { useDeviceStore } from '../store/useDeviceStore';
import FirmwareUpdateDialog from './dialogs/FirmwareUpdateDialog';

function shouldPresent(phase: FirmwareUpdatePhase): boolean {
  return (
    phase === 'available' ||
    phase === 'downloading' ||
    phase === 'ready' ||
    phase === 'applying' ||
    phase === 'error' ||
    phase === 'up-to-date'
  );
}

const FirmwareUpdateHost: React.FC = () => {
  const phase = useFirmwareUpdateStore((s) => s.phase);
  const promptVisible = useFirmwareUpdateStore((s) => s.promptVisible);
  const isWorking = useDeviceStore((s) => s.isWorking);
  const isLocked = useDeviceStore((s) => s.isLocked);
  const isConnected = useDeviceStore((s) => s.isConnected);
  const isBootloader = useDeviceStore((s) => s.isBootloader);
  const isInitialized = useDeviceStore((s) => s.isInitialized);
  const version = useDeviceStore((s) => s.version);
  const occupy = useDeviceStore((s) => s.setupOccupiesFirmwarePrompt);

  const deferred =
    isWorking || (isConnected && isLocked) || occupy || isBootloader;
  const open = isConnected && promptVisible && !deferred && shouldPresent(phase);

  const wasConnectedRef = useRef(false);

  useEffect(() => {
    return bindAutoUpdateFWPrefListeners();
  }, []);

  useEffect(() => {
    if (!isSafeFirmwareCheckMoment()) return;
    void startAutoCheck();
  }, [
    isConnected,
    isLocked,
    isBootloader,
    isWorking,
    occupy,
    version,
    isInitialized,
  ]);

  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
      return;
    }
    if (!wasConnectedRef.current) return;
    wasConnectedRef.current = false;
    resetOnDisconnect();
  }, [isConnected]);

  useEffect(() => {
    if (!open) return;
    // A prompt raised while the window sits in the tray should surface it.
    window.electronAPI?.showMainWindow?.().catch(() => {
      /* ignore */
    });
  }, [open]);

  return <FirmwareUpdateDialog open={open} />;
};

export default FirmwareUpdateHost;
