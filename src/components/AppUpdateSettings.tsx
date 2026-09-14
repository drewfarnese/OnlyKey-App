import React, { useEffect } from 'react';
import {
  bindAutoUpdatePrefListeners,
  checkNow,
  setAutoCheck,
  useAppUpdateStore,
} from '../store/useAppUpdateStore';
import { APP_RELEASES_PAGE_URL } from '../desktop/updater';
import { PrefRow } from './ui/PrefRow';
import { TOOLTIPS } from '../data/tooltips';

const AppUpdateSettings: React.FC = () => {
  const autoCheck = useAppUpdateStore((s) => s.autoCheck);
  const phase = useAppUpdateStore((s) => s.phase);
  const error = useAppUpdateStore((s) => s.error);
  const latestVersion = useAppUpdateStore((s) => s.latestVersion);
  const currentVersion = useAppUpdateStore((s) => s.currentVersion) || __APP_VERSION__;

  useEffect(() => bindAutoUpdatePrefListeners(), []);

  const busy = phase === 'checking';

  let status: string | null = null;
  if (phase === 'checking') status = 'Checking for updates…';
  else if (phase === 'available') status = `Version ${latestVersion} is available.`;
  else if (phase === 'up-to-date') status = `OnlyKey App ${currentVersion} is up to date.`;
  else if (error) status = error;

  return (
    <section className="tools-section" data-testid="app-update-settings">
      <PrefRow
        title="App updates"
        tooltip={TOOLTIPS.appUpdates}
        description={
          <>
            This computer is running OnlyKey App {currentVersion}. Releases are published on{' '}
            <a href={APP_RELEASES_PAGE_URL} target="_blank" rel="noreferrer" className="underline">
              GitHub
            </a>
            .
          </>
        }
        hint={status}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="ok-control"
            checked={autoCheck}
            onChange={(e) => setAutoCheck(e.target.checked)}
            data-testid="auto-update-checkbox"
          />
          Automatically check for app updates
        </label>
        <button
          type="button"
          className="px-5 py-2.5 bg-ok-blue hover:bg-blue-600 rounded-xl font-bold text-on-blue disabled:opacity-40"
          disabled={busy}
          onClick={() => {
            void checkNow();
          }}
          data-testid="check-now"
        >
          Check now
        </button>
      </PrefRow>
    </section>
  );
};

export default AppUpdateSettings;
