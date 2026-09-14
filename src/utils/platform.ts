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
 * True inside the Electron shell (the preload bridge is present).
 * Desktop-only features such as update checks gate on this.
 */
export function isDesktopShell(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;
}
