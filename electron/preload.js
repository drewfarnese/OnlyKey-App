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
    ipcRenderer.on('startup-settings-changed', (event, startupSettings) => callback(startupSettings));
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

