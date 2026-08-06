'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Main-process settings persisted as JSON in the Electron userData directory.
// Renderer preferences (autoUpdate etc.) live in localStorage; these settings
// must be readable before any window exists, so they get their own store.
const DEFAULTS = {
  launchAtStartup: false,
  startMinimized: false,
};

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  try {
    const stored = JSON.parse(fs.readFileSync(settingsFilePath(), 'utf8'));
    return { ...DEFAULTS, ...stored };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  try {
    fs.mkdirSync(path.dirname(settingsFilePath()), { recursive: true });
    fs.writeFileSync(settingsFilePath(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  const settings = load();
  settings[key] = value;
  save(settings);
  return settings;
}

module.exports = { load, get, set };
