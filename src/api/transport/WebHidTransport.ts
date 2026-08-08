import { TransportInterface, DeviceFilter } from './Transport.interface';

const BETA8_USAGE_PAGE = 0xffab; // 65451

type HidDeviceLike = {
  vendorId: number;
  productId: number;
  productName?: string;
  opened: boolean;
  collections?: Array<{
    usagePage?: number;
    inputReports?: Array<unknown>;
    outputReports?: Array<unknown>;
  }>;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  addEventListener(type: 'inputreport', listener: (event: HidInputReportEventLike) => void): void;
  removeEventListener(type: 'inputreport', listener: (event: HidInputReportEventLike) => void): void;
};

type HidInputReportEventLike = {
  reportId: number;
  data: DataView;
  device: HidDeviceLike;
};

type HidConnectionEventLike = { device: HidDeviceLike };

type NavigatorHidLike = {
  getDevices(): Promise<HidDeviceLike[]>;
  requestDevice(options: { filters: DeviceFilter[] }): Promise<HidDeviceLike[]>;
  addEventListener(type: 'connect' | 'disconnect', listener: (event: HidConnectionEventLike) => void): void;
};

function getNavigatorHid(): NavigatorHidLike | null {
  if (typeof navigator === 'undefined') return null;
  return ((navigator as unknown as { hid?: NavigatorHidLike }).hid ?? null);
}

/**
 * OnlyKey exposes multiple HID interfaces (keyboard emulation + raw HID).
 * The raw interface — the only one the app can talk to — is the one whose
 * collection has both input and output reports.
 */
function hasRawHidInterface(device: HidDeviceLike): boolean {
  return (device.collections ?? []).some(
    (c) => (c.inputReports?.length ?? 0) > 0 && (c.outputReports?.length ?? 0) > 0
  );
}

/**
 * WebHID transport for the Electron shell.
 *
 * Unlike chrome.hid, WebHID surfaces one HIDDevice per interface, does not
 * expose serial numbers, and pushes input reports as events instead of a
 * receive() poll loop. Device selection therefore keys off the raw-HID
 * interface shape (input+output reports, Beta8 usage page preferred) rather
 * than the v5.5 serial-number heuristic ChromeHidTransport uses.
 *
 * Permissions come from the Electron main process: it auto-grants OnlyKey
 * VID/PIDs (setDevicePermissionHandler / select-hid-device), so getDevices()
 * finds the key without a user-gesture permission prompt.
 */
export class WebHidTransport implements TransportInterface {
  static isAvailable(): boolean {
    return getNavigatorHid() !== null;
  }

  private device: HidDeviceLike | null = null;
  private connectedDevice: DeviceFilter | null = null;
  private receiveCallback: ((data: Uint8Array) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private deviceAddedCallback: (() => void) | null = null;
  private requestDeviceFailed = false;

  private onInputReport = (event: HidInputReportEventLike) => {
    if (event.device !== this.device || !this.receiveCallback) return;
    const view = event.data;
    this.receiveCallback(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  };

  constructor() {
    const hid = getNavigatorHid();
    if (!hid) return;

    hid.addEventListener('connect', (event) => {
      if (!hasRawHidInterface(event.device)) return;
      console.log(
        'WebHidTransport: Device added:',
        event.device.vendorId,
        event.device.productId,
        event.device.productName
      );
      this.requestDeviceFailed = false;
      if (!this.device && this.deviceAddedCallback) {
        this.deviceAddedCallback();
      }
    });

    hid.addEventListener('disconnect', (event) => {
      if (event.device === this.device) {
        console.log('WebHidTransport: Device removed:', event.device.productName);
        this.handleDisconnection();
      }
    });
  }

  onDeviceAdded(callback: () => void): void {
    this.deviceAddedCallback = callback;
  }

  static async listPermittedDevices(): Promise<
    Array<{ vendorId: number; productId: number; productName?: string }>
  > {
    const hid = getNavigatorHid();
    if (!hid) return [];
    try {
      const devices = await hid.getDevices();
      return devices.map((d) => ({
        vendorId: d.vendorId,
        productId: d.productId,
        productName: d.productName,
      }));
    } catch {
      return [];
    }
  }

  async connect(filter: DeviceFilter | DeviceFilter[]): Promise<void> {
    const hid = getNavigatorHid();
    if (!hid) {
      throw new Error('WebHID unavailable. Run the app with: npm start');
    }

    const filters = Array.isArray(filter) ? filter : [filter];
    const devices = await hid.getDevices();

    for (const deviceFilter of filters) {
      const device = this.selectDevice(devices, deviceFilter);
      if (device) {
        await this.openConnection(device);
        return;
      }
    }

    // Devices granted via the main process appear in getDevices(); requestDevice
    // is only a fallback (Electron auto-answers select-hid-device, no OS dialog).
    // The store re-probes every couple of seconds while disconnected, so a
    // failed attempt is not retried until a device (re)appears.
    if (!this.requestDeviceFailed) {
      try {
        const requested = await hid.requestDevice({ filters });
        for (const deviceFilter of filters) {
          const device = this.selectDevice(requested, deviceFilter);
          if (device) {
            await this.openConnection(device);
            return;
          }
        }
        this.requestDeviceFailed = true;
      } catch (err) {
        this.requestDeviceFailed = true;
        console.warn('WebHidTransport: requestDevice fallback failed:', err);
      }
    }

    throw new Error('Device not found');
  }

  private selectDevice(devices: HidDeviceLike[], filter: DeviceFilter): HidDeviceLike | null {
    const matches = devices.filter(
      (d) => d.vendorId === filter.vendorId && d.productId === filter.productId
    );
    if (!matches.length) return null;

    // Bootloader has a single simple interface — take any match.
    if (filter.productId === 0xb001) return matches[0];

    const raw = matches.filter(hasRawHidInterface);
    if (!raw.length) {
      console.warn('WebHidTransport: no raw-HID interface among matches for', filter);
      return null;
    }

    const beta8 = raw.find((d) =>
      (d.collections ?? []).some((c) => c.usagePage === BETA8_USAGE_PAGE)
    );
    return beta8 ?? raw[0];
  }

  private async openConnection(device: HidDeviceLike): Promise<void> {
    console.log('Connecting to device:', device.productName ?? `${device.vendorId}/${device.productId}`);
    if (!device.opened) {
      await device.open();
    }
    this.device = device;
    this.connectedDevice = { vendorId: device.vendorId, productId: device.productId };
    device.addEventListener('inputreport', this.onInputReport);
  }

  async disconnect(): Promise<void> {
    const device = this.device;
    this.device = null;
    this.connectedDevice = null;
    if (device) {
      device.removeEventListener('inputreport', this.onInputReport);
      if (device.opened) {
        // Intentional close — do not fire onDisconnect (mirrors ChromeHidTransport).
        try {
          await device.close();
        } catch (err) {
          console.warn('WebHidTransport: close failed:', err);
        }
      }
    }
  }

  private handleDisconnection() {
    const device = this.device;
    this.device = null;
    this.connectedDevice = null;
    if (device) {
      device.removeEventListener('inputreport', this.onInputReport);
      if (device.opened) {
        device.close().catch(() => {});
      }
    }
    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }

  async send(reportId: number, data: Uint8Array): Promise<void> {
    if (!this.device) {
      throw new Error('Not connected');
    }
    try {
      await this.device.sendReport(reportId, data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/disconnect|not found|invalid|closed/i.test(message)) {
        this.handleDisconnection();
      }
      throw new Error(message || 'Unknown send error');
    }
  }

  onReceive(callback: (data: Uint8Array) => void): void {
    this.receiveCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  getConnectedDevice(): DeviceFilter | null {
    return this.connectedDevice;
  }
}
