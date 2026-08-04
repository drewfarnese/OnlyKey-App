/**
 * WebHID Adapter - Provides a chrome.hid-like interface using WebHID API
 * This allows the OnlyKey app to work with Electron's WebHID support.
 */

// Store active device connections
const activeConnections = new Map();
let connectionIdCounter = 1;

// Track devices that are currently being opened (to prevent race conditions)
const pendingOpens = new Map();

// Device event listeners
const deviceAddedCallbacks = [];
const deviceRemovedCallbacks = [];

// Create a chrome.hid-compatible API using WebHID
const webHidAdapter = {
  // Simulates chrome.runtime.lastError
  lastError: null,

  /**
   * Get list of HID devices matching the filter
   * @param {Object} options - Device filter options (vendorId, productId)
   * @param {Function} callback - Called with array of devices
   */
  getDevices: async function(options, callback) {
    webHidAdapter.lastError = null;
    try {
      const devices = await navigator.hid.getDevices();
      console.log('WebHID getDevices: Found', devices.length, 'total HID devices');
      const filteredDevices = devices.filter(device => {
        if (options.vendorId && device.vendorId !== options.vendorId) return false;
        if (options.productId && device.productId !== options.productId) return false;

        // OnlyKey uses input/output reports (64 bytes each), NOT feature reports
        // The correct interface has input AND output reports
        // Filter for devices that have both input and output reports
        const hasInputOutputReports = device.collections && device.collections.some(c => {
          const inputCount = c.inputReports?.length || 0;
          const outputCount = c.outputReports?.length || 0;
          return inputCount > 0 && outputCount > 0;
        });

        if (!hasInputOutputReports) {
          console.log('WebHID getDevices: Skipping device (no input/output reports):',
            device.vendorId.toString(16), device.productId.toString(16),
            'collections:', device.collections?.map(c => ({
              usagePage: c.usagePage,
              inputReports: c.inputReports?.length || 0,
              outputReports: c.outputReports?.length || 0
            })));
          return false;
        }

        console.log('WebHID getDevices: Found HID device with input/output reports:',
          device.vendorId.toString(16), device.productId.toString(16));
        return true;
      }).map(device => webHidAdapter._mapDevice(device));
      console.log('WebHID getDevices: Returning', filteredDevices.length, 'filtered devices');
      callback(filteredDevices);
    } catch (error) {
      console.error('WebHID getDevices error:', error);
      webHidAdapter.lastError = { message: error.message };
      callback([]);
    }
  },

  /**
   * Request access to a HID device (shows browser permission dialog)
   */
  requestDevice: async function(filters) {
    try {
      const devices = await navigator.hid.requestDevice({ filters });
      return devices.map(d => webHidAdapter._mapDevice(d));
    } catch (error) {
      console.error('WebHID requestDevice error:', error);
      return [];
    }
  },

  /**
   * Connect to a HID device
   * @param {number|string} deviceId - Device ID or WebHID device reference
   * @param {Function} callback - Called with connection info
   */
  connect: async function(deviceId, callback) {
    webHidAdapter.lastError = null;
    try {
      // Check if we already have an active connection to this device
      for (const [connId, conn] of activeConnections.entries()) {
        if (conn.deviceId === deviceId && conn.device && conn.device.opened) {
          console.log('WebHID: Reusing existing connection', connId, 'for device', deviceId);
          callback({ connectionId: connId });
          return;
        }
      }

      // Check if a connection is already being opened for this device
      if (pendingOpens.has(deviceId)) {
        console.log('WebHID: Waiting for pending open for device', deviceId);
        const result = await pendingOpens.get(deviceId);
        callback(result);
        return;
      }

      // Create a promise for this open operation
      let resolveOpen;
      const openPromise = new Promise(resolve => { resolveOpen = resolve; });
      pendingOpens.set(deviceId, openPromise);

      try {
        // Find the device
        const devices = await navigator.hid.getDevices();
        let device = devices.find(d => webHidAdapter._getDeviceId(d) === deviceId);

        if (!device) {
          // Device not found, may need to request permission
          webHidAdapter.lastError = { message: 'Device not found or permission required' };
          resolveOpen(null);
          callback(null);
          return;
        }

        // Open the device if not already open
        if (!device.opened) {
          console.log('WebHID: Opening device', deviceId);
          await device.open();
          // Wait for device to stabilize after opening
          await new Promise(resolve => setTimeout(resolve, 300));
          console.log('WebHID: Device opened successfully', deviceId);
          // Log device capabilities for debugging
          console.log('WebHID: Device collections:', device.collections);
          device.collections.forEach((collection, i) => {
            console.log(`  Collection ${i}: usagePage=${collection.usagePage}, usage=${collection.usage}`);
            if (collection.outputReports) {
              console.log(`    Output reports:`, collection.outputReports.map(r => r.reportId));
            }
            if (collection.inputReports) {
              console.log(`    Input reports:`, collection.inputReports.map(r => r.reportId));
            }
          });
        } else {
          console.log('WebHID: Device already open', deviceId);
        }

        // Create a connection ID and store the device
        const connectionId = connectionIdCounter++;
        const conn = { device, deviceId, inputReportQueue: [] };
        activeConnections.set(connectionId, conn);

        // Set up input report listener to queue incoming reports
        device.addEventListener('inputreport', (event) => {
          // Queue the report for the receive() function to pick up
          conn.inputReportQueue.push({
            reportId: event.reportId,
            data: event.data
          });
        });

        const result = { connectionId };
        resolveOpen(result);
        callback(result);
      } finally {
        pendingOpens.delete(deviceId);
      }
    } catch (error) {
      console.error('WebHID connect error:', error);
      webHidAdapter.lastError = { message: error.message };
      callback(null);
    }
  },

  /**
   * Disconnect from a HID device
   */
  disconnect: async function(connectionId, callback) {
    webHidAdapter.lastError = null;
    try {
      const conn = activeConnections.get(connectionId);
      if (conn) {
        if (conn.device.opened) {
          await conn.device.close();
        }
      }
      activeConnections.delete(connectionId);
      if (callback) callback();
    } catch (error) {
      console.error('WebHID disconnect error:', error);
      webHidAdapter.lastError = { message: error.message };
      if (callback) callback();
    }
  },

  /**
   * Send data to a HID device using output reports
   * OnlyKey uses 64-byte output reports (not feature reports)
   */
  send: async function(connectionId, reportId, data, callback, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 100;
    webHidAdapter.lastError = null;
    try {
      const conn = activeConnections.get(connectionId);
      if (!conn) {
        throw new Error('Invalid connection ID: ' + connectionId);
      }

      // Check if device is still open
      if (!conn.device.opened) {
        console.warn('WebHID: Device not open, attempting to reopen');
        await conn.device.open();
        // Wait a bit after reopening
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // OnlyKey uses output reports for sending data
      await conn.device.sendReport(reportId, data);
      callback();
    } catch (error) {
      // Retry on transient errors
      if ((error.name === 'NotAllowedError' || error.name === 'NetworkError') && retryCount < maxRetries) {
        console.warn(`WebHID send error (${error.name}), retrying (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return webHidAdapter.send(connectionId, reportId, data, callback, retryCount + 1);
      }
      console.error('WebHID send error:', error);
      webHidAdapter.lastError = { message: error.message };
      callback();
    }
  },

  /**
   * Receive data from a HID device using input reports
   * OnlyKey uses 64-byte input reports (not feature reports)
   */
  receive: async function(connectionId, callback) {
    webHidAdapter.lastError = null;
    try {
      const conn = activeConnections.get(connectionId);
      if (!conn) {
        throw new Error('Invalid connection ID');
      }

      // Use input report event listener for receiving data
      // OnlyKey sends input reports which trigger the 'inputreport' event
      const timeoutMs = 5000;

      // Check if we already have a queued report
      if (conn.inputReportQueue && conn.inputReportQueue.length > 0) {
        const report = conn.inputReportQueue.shift();
        callback(report.reportId, report.data.buffer);
        return;
      }

      // Wait for next input report with timeout
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, timeoutMs);

        // One-time listener for next report
        const handler = (event) => {
          if (event.device === conn.device) {
            clearTimeout(timeout);
            conn.device.removeEventListener('inputreport', handler);
            resolve({ reportId: event.reportId, data: event.data });
          }
        };
        conn.device.addEventListener('inputreport', handler);
      });

      if (result) {
        callback(result.reportId, result.data.buffer);
      } else {
        console.warn('WebHID receive: timeout waiting for input report');
        callback(0, new ArrayBuffer(0));
      }
    } catch (error) {
      console.error('WebHID receive error:', error);
      webHidAdapter.lastError = { message: error.message };
      callback(0, new ArrayBuffer(0));
    }
  },

  // Device added/removed event handlers
  onDeviceAdded: {
    addListener: function(callback) {
      deviceAddedCallbacks.push(callback);
    }
  },

  onDeviceRemoved: {
    addListener: function(callback) {
      deviceRemovedCallbacks.push(callback);
    }
  },

  // Helper: Map WebHID device to chrome.hid device format
  _mapDevice: function(device) {
    return {
      deviceId: this._getDeviceId(device),
      vendorId: device.vendorId,
      productId: device.productId,
      productName: device.productName,
      serialNumber: device.serialNumber || '',
      maxInputReportSize: 64,
      maxOutputReportSize: 64,
      maxFeatureReportSize: 0,
      collections: device.collections.map(c => ({
        usagePage: c.usagePage,
        usage: c.usage,
        reportIds: c.inputReports?.map(r => r.reportId) || []
      })),
      _webHidDevice: device // Keep reference to original device
    };
  },

  // Generate a unique device ID (include usagePage to differentiate interfaces)
  _getDeviceId: function(device) {
    // Include the first collection's usagePage to differentiate keyboard vs raw HID interface
    const usagePage = device.collections?.[0]?.usagePage || 0;
    return `${device.vendorId}-${device.productId}-${usagePage}-${device.serialNumber || 'default'}`;
  },

  // Check if a device has the correct interface (with input/output reports)
  _hasValidInterface: function(device) {
    if (!device.collections) return false;
    return device.collections.some(c => {
      const inputCount = c.inputReports?.length || 0;
      const outputCount = c.outputReports?.length || 0;
      return inputCount > 0 && outputCount > 0;
    });
  }
};

// Set up WebHID device connect/disconnect events
if (typeof navigator !== 'undefined' && navigator.hid) {
  navigator.hid.addEventListener('connect', (event) => {
    // Only trigger for devices with valid input/output reports (raw HID interface)
    if (!webHidAdapter._hasValidInterface(event.device)) {
      console.log('WebHID connect: Ignoring device without input/output reports:',
        event.device.vendorId.toString(16), event.device.productId.toString(16));
      return;
    }
    const mappedDevice = webHidAdapter._mapDevice(event.device);
    deviceAddedCallbacks.forEach(cb => cb(mappedDevice));
  });

  navigator.hid.addEventListener('disconnect', (event) => {
    const mappedDevice = webHidAdapter._mapDevice(event.device);
    deviceRemovedCallbacks.forEach(cb => cb(mappedDevice.deviceId));
  });
}

// Create chrome.hid and chrome.runtime shims for compatibility
if (typeof chrome === 'undefined') {
  window.chrome = {};
}

chrome.hid = webHidAdapter;
chrome.runtime = chrome.runtime || {
  get lastError() {
    return webHidAdapter.lastError;
  }
};

// OnlyKey device filters
const ONLYKEY_FILTERS = [
  { vendorId: 0x16C0, productId: 0x0486 }, // OnlyKey firmware before Beta 7 (5824, 1158)
  { vendorId: 0x1D50, productId: 0x60FC }, // OnlyKey firmware Beta 7+ (7504, 24828)
  { vendorId: 0x0000, productId: 0xB001 }, // Black Vault Labs Bootloader (0, 45057)
];

/**
 * Request permission to access OnlyKey device
 * Must be called from a user gesture (click event)
 */
window.requestOnlyKeyAccess = async function() {
  try {
    console.log('Requesting OnlyKey device access...');
    const devices = await navigator.hid.requestDevice({ filters: ONLYKEY_FILTERS });

    if (devices.length > 0) {
      console.log('OnlyKey device access granted:', devices);
      // Trigger device added callbacks only for devices with valid interface
      devices.forEach(device => {
        if (!webHidAdapter._hasValidInterface(device)) {
          console.log('requestOnlyKeyAccess: Skipping device without input/output reports');
          return;
        }
        const mappedDevice = webHidAdapter._mapDevice(device);
        deviceAddedCallbacks.forEach(cb => cb(mappedDevice));
      });
      return true;
    } else {
      console.log('No OnlyKey device selected');
      return false;
    }
  } catch (error) {
    console.error('Error requesting OnlyKey access:', error);
    return false;
  }
};

/**
 * Check if we already have permission for OnlyKey devices
 */
window.checkOnlyKeyPermission = async function() {
  try {
    const devices = await navigator.hid.getDevices();
    const onlyKeyDevices = devices.filter(device =>
      ONLYKEY_FILTERS.some(f => f.vendorId === device.vendorId && f.productId === device.productId)
    );
    return onlyKeyDevices.length > 0;
  } catch (error) {
    console.error('Error checking OnlyKey permission:', error);
    return false;
  }
};

// Listen for device events from main process (Electron)
document.addEventListener('DOMContentLoaded', function() {
  // Listen for OnlyKey device added events from main process
  if (window.electronAPI && window.electronAPI.onOnlyKeyDeviceAdded) {
    window.electronAPI.onOnlyKeyDeviceAdded(async (device) => {
      console.log('OnlyKey device added (from main process):', device);
      // Re-enumerate devices to pick up the newly granted device
      const devices = await navigator.hid.getDevices();
      // Find device that matches vendor/product AND has valid interface
      const onlyKeyDevice = devices.find(d =>
        ONLYKEY_FILTERS.some(f => f.vendorId === d.vendorId && f.productId === d.productId) &&
        webHidAdapter._hasValidInterface(d)
      );
      if (onlyKeyDevice) {
        const mappedDevice = webHidAdapter._mapDevice(onlyKeyDevice);
        deviceAddedCallbacks.forEach(cb => cb(mappedDevice));
      } else {
        console.log('No valid OnlyKey interface found (with input/output reports)');
      }
    });
  }

  if (window.electronAPI && window.electronAPI.onOnlyKeyDeviceRemoved) {
    window.electronAPI.onOnlyKeyDeviceRemoved((device) => {
      console.log('OnlyKey device removed (from main process):', device);
      deviceRemovedCallbacks.forEach(cb => cb(device));
    });
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = webHidAdapter;
}

