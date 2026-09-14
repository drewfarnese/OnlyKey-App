import React from 'react';
import { dismissUpdatePrompt, openDownload, useAppUpdateStore } from '../../store/useAppUpdateStore';

interface AppUpdateDialogProps {
  open: boolean;
}

const AppUpdateDialog: React.FC<AppUpdateDialogProps> = ({ open }) => {
  const phase = useAppUpdateStore((s) => s.phase);
  const currentVersion = useAppUpdateStore((s) => s.currentVersion);
  const latestVersion = useAppUpdateStore((s) => s.latestVersion);
  const downloadUrl = useAppUpdateStore((s) => s.downloadUrl);
  const error = useAppUpdateStore((s) => s.error);

  if (!open) return null;

  let title = 'App update';
  let message = '';
  let confirmLabel: string | null = null;
  let cancelLabel = 'OK';

  if (phase === 'available') {
    title = 'App update available';
    message = downloadUrl
      ? `Version ${latestVersion} is available. You have ${currentVersion}. The installer download opens in your browser.`
      : `Version ${latestVersion} is available. You have ${currentVersion}. No installer for this operating system is attached to the release; the release page opens in your browser.`;
    confirmLabel = downloadUrl ? 'Download' : 'Open release page';
    cancelLabel = 'Later';
  } else if (phase === 'up-to-date') {
    message = `OnlyKey App ${currentVersion} is up to date.`;
  } else if (phase === 'error') {
    message = error || 'App update check failed.';
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      data-testid="app-update-dialog"
      role="dialog"
      aria-labelledby="app-update-dialog-title"
      aria-modal="true"
    >
      <div className="bg-ok-gray w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-4">
        <h3 id="app-update-dialog-title" className="text-xl font-bold">
          {title}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={dismissUpdatePrompt}
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl font-semibold"
          >
            {cancelLabel}
          </button>
          {confirmLabel && (
            <button
              type="button"
              onClick={() => {
                void openDownload();
              }}
              className="px-5 py-2.5 bg-ok-blue hover:bg-blue-600 rounded-xl font-bold text-on-blue"
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppUpdateDialog;
