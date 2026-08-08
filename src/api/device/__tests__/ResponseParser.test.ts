import { describe, it, expect } from 'vitest';
import { ResponseParser } from '../ResponseParser';
import { DeviceType } from '../types';

describe('ResponseParser', () => {
  const stringToPacket = (text: string) => {
    const data = new Uint8Array(64);
    for (let i = 0; i < text.length; i++) {
      data[i] = text.charCodeAt(i);
    }
    return data;
  };

  it('should parse OnlyKey Classic initialization', () => {
    const data = stringToPacket('INITIALIZEDv2.1.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('status');
    expect(res.deviceType).toBe(DeviceType.CLASSIC);
    expect(res.isLocked).toBe(true);
    expect(res.version).toBe('v2.1.0-prod');
  });

  it('should parse OnlyKey Duo initialization', () => {
    const data = stringToPacket('INITIALIZED-Dv3.0.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('status');
    expect(res.deviceType).toBe(DeviceType.DUO);
    expect(res.isLocked).toBe(true);
  });

  it('should keep Classic on unlocked v2 firmware even with a p suffix', () => {
    const data = stringToPacket('UNLOCKEDv2.1.0-prodp');
    const res = ResponseParser.parse(data);
    expect(res.deviceType).toBe(DeviceType.CLASSIC);
  });

  it('should infer DUO from unlocked v3 firmware without -D suffix', () => {
    const data = stringToPacket('UNLOCKEDv3.0.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.isLocked).toBe(false);
    expect(res.version).toBe('v3.0.0-prod');
    expect(res.deviceType).toBe(DeviceType.DUO);
  });

  it('should parse DUO unlocked state with -D prefix', () => {
    const data = stringToPacket('UNLOCKED-Dv3.0.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.deviceType).toBe(DeviceType.DUO);
    expect(res.isLocked).toBe(false);
  });

  it('should parse Slot Labels correctly', () => {
    const data = stringToPacket('01|GitHub Login');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('label');
    expect(res.slotId).toBe(1);
    expect(res.label).toBe('GitHub Login');
  });

  it('should parse logical Slot IDs (1a-6b)', () => {
    const data = stringToPacket('1a|Work VPN');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('label');
    expect(res.slotId).toBe(1);
    expect(res.label).toBe('Work VPN');
  });

  // Real Classic v3.0.4 firmware sends the slot number as a BCD byte:
  // slot 11 (5b) arrives as [0x11, 0x7c, ...label] (captured over WebHID).
  it('should decode BCD binary slot bytes for slots 10-12', () => {
    const cases: Array<[number, number, string]> = [
      [0x01, 1, 'CM VPN'],
      [0x09, 9, 'CM AD (No Enter)'],
      [0x10, 10, 'CMCloud'],
      [0x11, 11, 'QA TEST'],
      [0x12, 12, 'HQ New'],
    ];
    for (const [byte, slotId, label] of cases) {
      const data = new Uint8Array(64);
      data[0] = byte;
      data[1] = 0x7c; // '|'
      for (let i = 0; i < label.length; i++) data[i + 2] = label.charCodeAt(i);
      const res = ResponseParser.parse(data);
      expect(res.type).toBe('label');
      expect(res.slotId).toBe(slotId);
      expect(res.label).toBe(label);
    }
  });

  it('should decode BCD binary slot bytes for DUO green-profile slots (13-24)', () => {
    const data = new Uint8Array(64);
    data[0] = 0x24; // DUO slot 24 as BCD
    data[1] = 0x7c;
    data[2] = 0x58; // 'X'
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('label');
    expect(res.slotId).toBe(24);
  });

  it('should parse error messages', () => {
    const data = stringToPacket('Error: Not in Config Mode');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('error');
    expect(res.error).toContain('Error');
  });

  it('should handle empty or garbage data gracefully', () => {
    const data = new Uint8Array(64).fill(0);
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('text');
    expect(res.text).toBe('');
  });
});
