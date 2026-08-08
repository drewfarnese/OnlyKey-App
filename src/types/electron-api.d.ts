export interface StartupSettings {
  launchAtStartup: boolean;
  startMinimized: boolean;
}

export interface ElectronAPI {
  getAppVersion(): Promise<string>;
  getAppPath(): Promise<string>;
  getPlatform(): Promise<NodeJS.Platform>;
  openExternal(url: string): Promise<void>;
  getStartupSettings(): Promise<StartupSettings>;
  setStartupSettings(partial: Partial<StartupSettings>): Promise<StartupSettings>;
  onStartupSettingsChanged(callback: (settings: StartupSettings) => void): void;
  isElectron: boolean;
  isDesktop: boolean;
  onOnlyKeyDeviceAdded(callback: (device: unknown) => void): void;
  onOnlyKeyDeviceRemoved(callback: (device: unknown) => void): void;
  /** Parses an SSH private key in the preload (Node) context; returns plain data only. */
  parseSshPrivateKey(pem: string, passphrase?: string): { type: string; pkcs1: number[] };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
