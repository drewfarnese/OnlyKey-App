'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // App startup settings (launch at login, run minimized in the tray)
  getStartupSettings: () => ipcRenderer.invoke('get-startup-settings'),
  setStartupSettings: (partial) => ipcRenderer.invoke('set-startup-settings', partial),
  onStartupSettingsChanged: (callback) => {
    const listener = (event, startupSettings) => callback(startupSettings);
    ipcRenderer.on('startup-settings-changed', listener);
    return () => ipcRenderer.removeListener('startup-settings-changed', listener);
  },

  // Platform detection
  isElectron: true,
  isDesktop: true,

  // HID device event listeners
  onOnlyKeyDeviceAdded: (callback) => {
    ipcRenderer.on('onlykey-device-added', (event, device) => callback(device));
  },
  onOnlyKeyDeviceRemoved: (callback) => {
    ipcRenderer.on('onlykey-device-removed', (event, device) => callback(device));
  },

  // sshpk needs real Node util/crypto, which the isolated renderer lacks.
  // Parse here and hand back plain data only; key material never leaves the
  // renderer<->preload boundary (no IPC to the main process).
  parseSshPrivateKey: (pem, passphrase) => {
    const sshpk = require('sshpk');
    const key = sshpk.parsePrivateKey(pem, 'pem', { passphrase: passphrase || undefined });
    // Hand the renderer the raw private parts (RSA p/q, ECDSA d, ed25519 k):
    // the firmware wants p||q or a 32-byte scalar, never DER (see keyMaterial.ts).
    const parts = {};
    for (const name of ['p', 'q', 'd', 'k']) {
      const part = key.part && key.part[name];
      if (part && part.data) parts[name] = Array.from(part.data);
    }
    return { type: key.type, curve: key.curve, parts };
  },
});

// Expose Node.js modules needed by the app
contextBridge.exposeInMainWorld('nodeRequire', {
  // Auto-launch functionality
  getAutoLaunch: () => {
    const AutoLaunch = require('auto-launch');
    return AutoLaunch;
  },
  
  // OS module for platform detection
  platform: process.platform,
  
  // Path utilities
  join: (...args) => require('path').join(...args),
});

// Note: WebHID API (navigator.hid) is available directly in the renderer
// as long as the app is running in a secure context and has proper permissions
// configured in the main process.

