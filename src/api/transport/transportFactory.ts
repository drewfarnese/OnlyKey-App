import { TransportInterface } from './Transport.interface';
import { ChromeHidTransport } from './ChromeHidTransport';
import { WebHidTransport } from './WebHidTransport';

export type HidTransport = (ChromeHidTransport | WebHidTransport) & TransportInterface;

/** chrome.hid in the NW.js shell, WebHID in the Electron shell. */
export function createHidTransport(): HidTransport {
  if (ChromeHidTransport.isAvailable()) return new ChromeHidTransport();
  return new WebHidTransport();
}

export function isHidAvailable(): boolean {
  return ChromeHidTransport.isAvailable() || WebHidTransport.isAvailable();
}

export async function listPermittedHidDevices(): Promise<
  Array<{ vendorId: number; productId: number; productName?: string }>
> {
  if (ChromeHidTransport.isAvailable()) {
    const devices = await ChromeHidTransport.listPermittedDevices();
    return devices.map((d) => ({
      vendorId: d.vendorId,
      productId: d.productId,
      productName: d.productName,
    }));
  }
  return WebHidTransport.listPermittedDevices();
}
