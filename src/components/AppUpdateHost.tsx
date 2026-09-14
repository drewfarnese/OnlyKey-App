import React, { useEffect } from 'react';
import {
  bindAutoUpdatePrefListeners,
  startAutoCheck,
  useAppUpdateStore,
  type AppUpdatePhase,
} from '../store/useAppUpdateStore';
import { useDeviceStore } from '../store/useDeviceStore';
import AppUpdateDialog from './dialogs/AppUpdateDialog';

function shouldPresent(phase: AppUpdatePhase): boolean {
  return phase === 'available' || phase === 'up-to-date' || phase === 'error';
}

/**
 * Runs the startup update check and renders the update dialog. Mounted
 * outside the session-scoped subtree so a device lock/unlock does not restart
 * the check or drop a pending prompt.
 */
const AppUpdateHost: React.FC = () => {
  const phase = useAppUpdateStore((s) => s.phase);
  const promptVisible = useAppUpdateStore((s) => s.promptVisible);
  const isWorking = useDeviceStore((s) => s.isWorking);
  const isLocked = useDeviceStore((s) => s.isLocked);
  const isConnected = useDeviceStore((s) => s.isConnected);

  // Never cover a PIN entry or a running device operation.
  const deferred = isWorking || (isConnected && isLocked);
  const open = promptVisible && !deferred && shouldPresent(phase);

  useEffect(() => {
    const unbind = bindAutoUpdatePrefListeners();
    // After paint so React StrictMode does not start-then-cancel the first check.
    const id = window.setTimeout(() => {
      void startAutoCheck();
    }, 0);
    return () => {
      window.clearTimeout(id);
      unbind();
    };
  }, []);

  return <AppUpdateDialog open={open} />;
};

export default AppUpdateHost;
