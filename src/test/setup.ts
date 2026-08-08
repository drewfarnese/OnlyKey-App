import './mocks/desktop';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetDeviceStoreForTests } from './store';

// Node 23+ ships an experimental global localStorage/sessionStorage stub
// (no backing file → no working methods) that shadows happy-dom's storage in
// test workers — and the happy-dom window is merged into the same global, so
// window.localStorage hits the same stub. Replace with an in-memory Storage.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[key]?.clear !== 'function') {
    Object.defineProperty(globalThis, key, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

beforeEach(() => {
  document.documentElement.classList.remove('light');
  document.documentElement.style.colorScheme = 'dark';
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => false));
  vi.stubGlobal('alert', vi.fn());
});

afterEach(async () => {
  cleanup();
  await resetDeviceStoreForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});