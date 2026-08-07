/* Binds the App Settings checkboxes in the Preferences panel to the Electron
   main process, which owns the settings store, the OS login item, and the
   tray menu. Stays hidden outside Electron (e.g. the Chrome app build). */

(function () {
  'use strict';

  if (typeof window.electronAPI === 'undefined' || !window.electronAPI.getStartupSettings) return;

  const container = document.getElementById('app-settings');
  const launchAtStartupBox = document.getElementById('launchAtStartupPref');
  const runMinimizedBox = document.getElementById('runMinimizedPref');

  function render(startupSettings) {
    launchAtStartupBox.checked = !!startupSettings.launchAtStartup;
    runMinimizedBox.checked = !!startupSettings.startMinimized;
  }

  launchAtStartupBox.addEventListener('change', async () => {
    render(await window.electronAPI.setStartupSettings({
      launchAtStartup: launchAtStartupBox.checked,
    }));
  });

  runMinimizedBox.addEventListener('change', async () => {
    render(await window.electronAPI.setStartupSettings({
      startMinimized: runMinimizedBox.checked,
    }));
  });

  // Reflect changes made from the tray menu
  window.electronAPI.onStartupSettingsChanged(render);

  window.electronAPI.getStartupSettings().then((startupSettings) => {
    render(startupSettings);
    container.classList.remove('hide');
  });
})();
