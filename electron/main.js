'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./settings');
const startup = require('./startup');

// Disable HID blocklist to allow OnlyKey devices
// This must be done before app is ready
app.commandLine.appendSwitch('disable-hid-blocklist');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;
let tray = null;
let isQuitting = false;

// Only allow one running instance; launching a second (e.g. manually, after
// the app auto-started at login) surfaces the existing window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// OnlyKey device filters for WebHID
const ONLYKEY_DEVICE_FILTERS = [
  { vendorId: 0x16C0, productId: 0x0486 }, // OnlyKey firmware before Beta 7
  { vendorId: 0x1D50, productId: 0x60FC }, // OnlyKey firmware Beta 7+
  { vendorId: 0x0000, productId: 0xB001 }, // Black Vault Labs Bootloader
];

function createWindow() {
  // Use appropriate icon based on platform
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../resources/windows/icon.ico')
    : path.join(__dirname, '../resources/onlykey_logo_128.png');

  // Start hidden in the tray when the user enabled that option, or when
  // launched with --hidden (e.g. by an OS login item)
  const startMinimized = settings.get('startMinimized') || process.argv.includes('--hidden');

  mainWindow = new BrowserWindow({
    show: !startMinimized,
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 400,
    icon: iconPath,
    autoHideMenuBar: true, // Hide menu bar by default (press Alt to show)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for some Node.js features in preload
    },
  });

  // Open external links (WebCrypt apps, docs) in the system browser instead of
  // spawning Electron child windows. OnlyKey WebCrypt must run in the user's
  // default browser to use its own WebHID permissions.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent in-place navigation away from the app (e.g. clicking a link that
  // isn't intercepted in the renderer) — open it externally instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Load the React UI (Vite build); a Vite dev server URL takes precedence
  // for HMR development.
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const distIndex = path.join(__dirname, '../dist/index.html');

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl).catch((err) => {
      console.error('Failed to load dev server URL:', err);
    });
  } else {
    if (!fs.existsSync(distIndex)) {
      console.error('dist/index.html not found — run "pnpm run build:ui" first');
    }
    mainWindow.loadFile(distIndex).catch((err) => {
      console.error(`Failed to load ${distIndex}:`, err);
    });
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });

  // Open DevTools only in development mode
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools();
  }

  // Once the page is ready, signal that we're ready for device access
  mainWindow.webContents.on('did-finish-load', async () => {
    console.log('Main window loaded, WebHID ready for device access');
    // Device enumeration happens through WebHID API in the renderer process
    // The select-hid-device handler will prompt the user to select a device
  });

  // While the tray option is enabled the app keeps running in the tray when
  // the window is closed; quitting is done from the tray menu
  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.get('startMinimized')) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function getStartupSettings() {
  return {
    launchAtStartup: settings.get('launchAtStartup'),
    startMinimized: settings.get('startMinimized'),
  };
}

// Keep the tray menu and the renderer's App Settings checkboxes in sync no
// matter which of the two changed a setting
function broadcastStartupSettings() {
  refreshTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('startup-settings-changed', getStartupSettings());
  }
}

async function setLaunchAtStartup(enabled) {
  settings.set('launchAtStartup', enabled);
  try {
    await startup.setEnabled(enabled);
  } catch (err) {
    console.error('Failed to update launch-at-startup:', err);
    // Revert the stored setting if the OS change failed
    settings.set('launchAtStartup', !enabled);
  }
  broadcastStartupSettings();
}

function setStartMinimized(enabled) {
  settings.set('startMinimized', enabled);
  broadcastStartupSettings();
}

function refreshTrayMenu() {
  if (!tray) return;

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show OnlyKey App',
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: 'Launch at system startup',
      type: 'checkbox',
      checked: settings.get('launchAtStartup'),
      click: (menuItem) => {
        setLaunchAtStartup(menuItem.checked);
      },
    },
    {
      // Starts the app hidden and keeps it in the tray when the window closes
      label: 'Run minimized in the tray',
      type: 'checkbox',
      checked: settings.get('startMinimized'),
      click: (menuItem) => {
        setStartMinimized(menuItem.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]));
}

async function createTray() {
  tray = new Tray(path.join(__dirname, '../resources/ok-tray-logo.png'));
  tray.setToolTip('OnlyKey App');

  // Reflect the real OS state in the menu (and stored setting) in case the
  // login item was added/removed outside the app
  try {
    settings.set('launchAtStartup', await startup.isEnabled());
  } catch (err) {
    console.error('Failed to read launch-at-startup state:', err);
  }

  refreshTrayMenu();

  // On Windows/Linux a plain click on the tray icon brings up the window;
  // on macOS clicking the tray icon opens the context menu instead
  tray.on('click', () => {
    if (process.platform !== 'darwin') {
      showMainWindow();
    }
  });
}

// Only http(s) URLs may leave the app for the system browser
function isExternalUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch (e) {
    return false;
  }
}

// Store granted device permissions to persist across sessions
const grantedDevicePermissions = new Map();

// Check if device matches OnlyKey filters
function isOnlyKeyDevice(device) {
  return ONLYKEY_DEVICE_FILTERS.some(
    (filter) => filter.vendorId === device.vendorId && filter.productId === device.productId
  );
}

// Handle WebHID device selection
function setupHIDHandlers() {
  // Automatically check permissions for HID devices
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'hid') {
      // Allow HID access for OnlyKey devices
      if (details.device && isOnlyKeyDevice(details.device)) {
        return true;
      }
      // Check if this device was previously granted
      if (details.device && grantedDevicePermissions.has(details.device.deviceId)) {
        return true;
      }
    }
    return true; // Allow other permissions to proceed normally
  });

  // Handle device permission requests - auto-grant for OnlyKey devices
  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'hid') {
      const device = details.device;
      // Auto-grant permission for OnlyKey devices
      if (isOnlyKeyDevice(device)) {
        // Store the granted permission (only log once per device)
        if (!grantedDevicePermissions.has(device.deviceId)) {
          console.log('Auto-granted HID permission for OnlyKey device:', device.vendorId.toString(16), device.productId.toString(16));
        }
        grantedDevicePermissions.set(device.deviceId, device);
        return true;
      }
    }
    return false;
  });

  // Handle select-hid-device event - auto-select OnlyKey device
  session.defaultSession.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();

    // Find OnlyKey device in the list
    const onlyKeyDevice = details.deviceList.find((device) => isOnlyKeyDevice(device));

    if (onlyKeyDevice) {
      console.log('Auto-selecting OnlyKey device:', onlyKeyDevice.deviceId);
      callback(onlyKeyDevice.deviceId);
    } else {
      console.log('No OnlyKey device found in device list');
      callback(''); // No device selected
    }
  });

  // Track HID device connections and grant permissions proactively
  session.defaultSession.on('hid-device-added', (event, device) => {
    console.log('HID device added:', device.vendorId.toString(16), device.productId.toString(16));
    // Auto-grant permission when OnlyKey is plugged in
    if (isOnlyKeyDevice(device)) {
      grantedDevicePermissions.set(device.deviceId, device);
      // Grant device permission so getDevices() will return it
      if (mainWindow && mainWindow.webContents) {
        session.defaultSession.grantDevicePermission(mainWindow.webContents, device, 'hid');
        console.log('Granted HID permission for OnlyKey device');
        // Notify renderer that device is available
        mainWindow.webContents.send('onlykey-device-added', device);
      }
    }
  });

  session.defaultSession.on('hid-device-removed', (event, device) => {
    console.log('HID device removed:', device.vendorId.toString(16), device.productId.toString(16));
    grantedDevicePermissions.delete(device.deviceId);
    if (isOnlyKeyDevice(device) && mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('onlykey-device-removed', device);
    }
  });
}

app.whenReady().then(() => {
  setupHIDHandlers();
  createWindow();
  createTray().catch((err) => {
    console.error('Failed to create tray:', err);
  });

  app.on('activate', () => {
    // On macOS, show (or re-create) the window when the dock icon is clicked
    showMainWindow();
  });
});

app.on('second-instance', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for renderer process communication
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('get-startup-settings', () => {
  return getStartupSettings();
});

ipcMain.handle('set-startup-settings', async (event, partial) => {
  const { launchAtStartup, startMinimized } = partial || {};
  if (typeof startMinimized === 'boolean') {
    setStartMinimized(startMinimized);
  }
  if (typeof launchAtStartup === 'boolean') {
    await setLaunchAtStartup(launchAtStartup);
  }
  // Return the resulting state so the UI reflects a failed OS change
  return getStartupSettings();
});

ipcMain.handle('open-external', (event, url) => {
  if (isExternalUrl(url)) {
    return shell.openExternal(url);
  }
  console.warn('Blocked open-external for non-http(s) URL:', url);
});

