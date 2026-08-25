import { checkForAppUpdate } from './updater';
import { bindWindowVisibilityHandlers } from './windowVisibility';

function resolveAppRoot(): string {
  const path = require('path') as typeof import('path');
  const fs = require('fs') as typeof import('fs');
  const candidates: string[] = [];
  try {
    if (nw.App?.startPath) candidates.push(nw.App.startPath);
  } catch {
    // ignore
  }
  try {
    if (process.platform === 'darwin' && process.execPath) {
      candidates.push(path.resolve(path.dirname(process.execPath), '..', 'Resources', 'app.nw'));
    }
  } catch {
    // ignore
  }
  try {
    if (process.execPath) candidates.push(path.dirname(process.execPath));
  } catch {
    // ignore
  }
  try {
    candidates.push(process.cwd());
  } catch {
    // ignore
  }
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'desktopBg.cjs'))) return dir;
  }
  return nw.App.startPath;
}

function isElectronShell(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
}

function ensureNwDesktopStarted(): void {
  try {
    const path = require('path') as typeof import('path');
    const desktop = require(path.join(resolveAppRoot(), 'desktopBg.cjs')) as {
      start?: () => void;
    };
    desktop.start?.();
  } catch (error) {
    console.error('Desktop start fallback failed:', error);
  }
}

export async function initDesktop(): Promise<void> {
  if (isElectronShell()) {
    // Tray, window visibility, and close-to-tray are owned by electron/main.js.
    checkForAppUpdate().catch(console.error);

    // electron/main.js also intercepts will-navigate/window-open; this handler
    // stops the in-app navigation attempt before it starts.
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!target || !target.href) return;
      if (target.href.startsWith('http')) {
        e.preventDefault();
        window.electronAPI?.openExternal(target.href);
      }
    });
    return;
  }

  ensureNwDesktopStarted();
  const win = nw.Window.get();
  bindWindowVisibilityHandlers(win);
  window.setTimeout(() => {
    ensureNwDesktopStarted();
    bindWindowVisibilityHandlers(win);
  }, 100);

  checkForAppUpdate().catch(console.error);

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!target || !target.href) return;
    if (target.href.startsWith('http') && typeof nw !== 'undefined') {
      e.preventDefault();
      nw.Shell.openExternal(target.href);
    }
  });
}