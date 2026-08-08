export function getHidStatus(): { available: boolean; hint: string } {
  const chromeHid = typeof chrome !== 'undefined' && !!chrome.hid?.getDevices;
  const webHid =
    typeof navigator !== 'undefined' && !!(navigator as { hid?: unknown }).hid;

  if (chromeHid || webHid) {
    return { available: true, hint: 'HID API ready — polling for your device.' };
  }

  const onLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return {
    available: false,
    hint: onLocalhost
      ? 'HID unavailable on localhost. Close this window and run: npm start'
      : 'HID API unavailable. Run the app with: npm start',
  };
}
