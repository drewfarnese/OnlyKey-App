import { afterEach, describe, expect, it, vi } from 'vitest';
import { initDesktop } from '../initDesktop';

afterEach(() => {
  delete (window as { electronAPI?: unknown }).electronAPI;
});

describe('initDesktop', () => {
  it('does nothing outside the Electron shell', async () => {
    await initDesktop();
    const anchor = document.createElement('a');
    anchor.href = 'https://docs.crp.to/usersguide.html';
    document.body.appendChild(anchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    anchor.remove();
  });

  it('opens http links in the system browser and ignores anchors without an href', async () => {
    const openExternal = vi.fn(async () => {});
    Object.assign(window, { electronAPI: { isElectron: true, isDesktop: true, openExternal } });
    await initDesktop();

    const external = document.createElement('a');
    external.href = 'https://docs.crp.to/usersguide.html';
    document.body.appendChild(external);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    external.dispatchEvent(event);
    expect(openExternal).toHaveBeenCalledWith(external.href);
    expect(event.defaultPrevented).toBe(true);
    external.remove();

    const internal = document.createElement('a');
    internal.textContent = 'no href';
    document.body.appendChild(internal);
    const internalEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    internal.dispatchEvent(internalEvent);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(internalEvent.defaultPrevented).toBe(false);
    internal.remove();
  });
});
