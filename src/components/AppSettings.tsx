import React, { useEffect, useState } from 'react';
import type { StartupSettings } from '../types/electron-api';
import { PrefRow } from './ui/PrefRow';
import { TOOLTIPS } from '../data/tooltips';

/**
 * App-level startup settings (launch at login, run minimized in the tray).
 * The Electron main process owns the settings store, the OS login item, and
 * the tray menu; this card stays hidden outside the Electron shell and
 * mirrors changes made from the tray menu. It lives on Tools so it is
 * reachable without a device connected.
 */
const AppSettings: React.FC = () => {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const [settings, setSettings] = useState<StartupSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api?.getStartupSettings) return;
    let mounted = true;
    api.getStartupSettings().then((s) => {
      if (mounted) setSettings(s);
    });
    const unsubscribe = api.onStartupSettingsChanged((s) => {
      if (mounted) setSettings(s);
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!api?.getStartupSettings || !settings) return null;

  const update = async (partial: Partial<StartupSettings>) => {
    setBusy(true);
    try {
      // The main process returns the resulting state so the UI reflects a
      // failed OS change (e.g. login-item update rejected).
      setSettings(await api.setStartupSettings(partial));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tools-section" data-testid="app-settings">
      <PrefRow title="App settings" tooltip={TOOLTIPS.appSettings}>
        {/* Stack the two checkboxes; the default row layout would centre them */}
        <div className="flex flex-col items-start gap-2">
          <label
            className="flex items-center gap-2 text-sm"
            title="Automatically start the OnlyKey App when you log in to your computer"
          >
            <input
              type="checkbox"
              checked={settings.launchAtStartup}
              disabled={busy}
              onChange={(e) => update({ launchAtStartup: e.target.checked })}
              className="ok-control"
            />
            Launch app at system startup
          </label>
          <label
            className="flex items-center gap-2 text-sm"
            title="Start hidden in the system tray and keep running there when the window is closed"
          >
            <input
              type="checkbox"
              checked={settings.startMinimized}
              disabled={busy}
              onChange={(e) => update({ startMinimized: e.target.checked })}
              className="ok-control"
            />
            Run minimized in the system tray
          </label>
        </div>
      </PrefRow>
    </section>
  );
};

export default AppSettings;
