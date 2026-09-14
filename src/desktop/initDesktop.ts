/**
 * Renderer-side desktop wiring for the Electron shell. Tray, window
 * visibility, close-to-tray, and login items are owned by electron/main.js;
 * the app and firmware update checks are started by their React hosts.
 */
export async function initDesktop(): Promise<void> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api?.isElectron) return;

  // electron/main.js also intercepts will-navigate/window-open; this handler
  // stops the in-app navigation attempt before it starts.
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!target || !target.href) return;
    if (target.href.startsWith('http')) {
      e.preventDefault();
      api.openExternal(target.href);
    }
  });
}
