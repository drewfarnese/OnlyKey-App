'use strict';

const { app } = require('electron');

// app.setLoginItemSettings() only works on Windows and macOS; Linux needs the
// auto-launch package, which writes a .desktop file to ~/.config/autostart.
const useLoginItemSettings = process.platform === 'win32' || process.platform === 'darwin';

let linuxAutoLauncher = null;

function getLinuxAutoLauncher() {
  if (!linuxAutoLauncher) {
    const AutoLaunch = require('auto-launch');
    // auto-launch derives the .desktop entry name from the executable's
    // basename ("onlykey-app" in a release, "electron" in development), so a
    // dev checkout never clobbers an installed release's autostart entry
    linuxAutoLauncher = new AutoLaunch({
      name: 'OnlyKey',
      path: process.execPath,
      isHidden: false,
    });
  }
  return linuxAutoLauncher;
}

async function isEnabled() {
  if (useLoginItemSettings) {
    return app.getLoginItemSettings().openAtLogin;
  }
  return getLinuxAutoLauncher().isEnabled();
}

async function setEnabled(enabled) {
  if (useLoginItemSettings) {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }

  const launcher = getLinuxAutoLauncher();
  const currentlyEnabled = await launcher.isEnabled();
  if (enabled && !currentlyEnabled) {
    await launcher.enable();
  } else if (!enabled && currentlyEnabled) {
    await launcher.disable();
  }
}

module.exports = { isEnabled, setEnabled };
