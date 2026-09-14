export function isLinux(): boolean {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'linux';
  }
  return typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('linux');
}

export function isConnectErrorLikelyUdev(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('cannot open device') ||
    lower.includes('access denied') ||
    lower.includes('permission') ||
    lower.includes('failed to open') ||
    lower.includes('unable to connect')
  );
}
/**
 * True inside a desktop shell (Electron via the preload bridge, or NW.js).
 * Desktop-only features such as update checks gate on this.
 */
export function isDesktopShell(): boolean {
  if (typeof window !== 'undefined' && window.electronAPI?.isDesktop) return true;
  return typeof nw !== 'undefined';
}
