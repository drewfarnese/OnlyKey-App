import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userPreferences } from '../userPreferences';
import {
  APP_RELEASES_API_URL,
  APP_RELEASES_PAGE_URL,
  APP_UPDATE_SESSION_KEY,
  AppUpdateError,
  type AppUpdateIo,
  checkAppUpdate,
  compareSemver,
  isAllowedDownloadUrl,
  isHttpsUrl,
  openAppUpdateDownload,
  pickInstallerAsset,
  platformInstallerExtension,
} from '../updater';

const DOWNLOAD_BASE = 'https://github.com/drewfarnese/OnlyKey-App/releases/download/v6.1.0';

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v6.1.0',
    html_url: 'https://github.com/drewfarnese/OnlyKey-App/releases/tag/v6.1.0',
    assets: [
      { name: 'OnlyKey_6.1.0.exe', browser_download_url: `${DOWNLOAD_BASE}/OnlyKey_6.1.0.exe` },
      { name: 'OnlyKey_6.1.0_amd64.deb', browser_download_url: `${DOWNLOAD_BASE}/OnlyKey_6.1.0_amd64.deb` },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function io(partial: Partial<AppUpdateIo> = {}): AppUpdateIo {
  return {
    isDesktop: () => true,
    autoUpdateEnabled: () => true,
    getAppVersion: async () => '6.0.0',
    getPlatform: async () => 'linux',
    ...partial,
  };
}

describe('updater helpers', () => {
  it('compares semver with and without a v prefix', () => {
    expect(compareSemver('5.7.1', '5.7.0')).toBe(1);
    expect(compareSemver('v6.0.0', '6.0.0')).toBe(0);
    expect(compareSemver('5.6.9', '5.7.0')).toBe(-1);
    expect(compareSemver('6.0.10', '6.0.9')).toBe(1);
  });

  it('accepts only https URLs', () => {
    expect(isHttpsUrl('https://example.com/a')).toBe(true);
    expect(isHttpsUrl('http://example.com/a')).toBe(false);
    expect(isHttpsUrl('not-a-url')).toBe(false);
  });

  it('allows only this repository release downloads', () => {
    expect(isAllowedDownloadUrl(`${DOWNLOAD_BASE}/OnlyKey_6.1.0.exe`)).toBe(true);
    expect(isAllowedDownloadUrl(APP_RELEASES_PAGE_URL)).toBe(true);
    expect(isAllowedDownloadUrl('https://github.com/evil/OnlyKey-App/releases/download/v1/x.exe')).toBe(false);
    expect(isAllowedDownloadUrl('http://github.com/drewfarnese/OnlyKey-App/releases/download/v1/x.exe')).toBe(false);
  });

  it('maps platforms to installer extensions', () => {
    expect(platformInstallerExtension('win32')).toBe('.exe');
    expect(platformInstallerExtension('darwin')).toBe('.dmg');
    expect(platformInstallerExtension('linux')).toBe('.deb');
    expect(platformInstallerExtension('freebsd')).toBeNull();
  });

  it('picks the installer for the platform and ignores foreign hosts', () => {
    const rel = release({
      assets: [
        { name: 'OnlyKey_6.1.0.exe', browser_download_url: 'https://evil.example/OnlyKey_6.1.0.exe' },
        { name: 'OnlyKey_6.1.0.exe', browser_download_url: `${DOWNLOAD_BASE}/OnlyKey_6.1.0.exe` },
      ],
    });
    expect(pickInstallerAsset(rel, 'win32')).toBe(`${DOWNLOAD_BASE}/OnlyKey_6.1.0.exe`);
    expect(pickInstallerAsset(rel, 'darwin')).toBeNull();
    expect(pickInstallerAsset({ assets: 'nope' }, 'win32')).toBeNull();
  });
});

describe('checkAppUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips outside a desktop shell', async () => {
    const fetchFn = vi.fn();
    const result = await checkAppUpdate(io({ isDesktop: () => false, fetchFn: fetchFn as never }));
    expect(result).toEqual({ kind: 'skipped', reason: 'not-desktop' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('skips an automatic check when the preference is off, but not a forced one', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(release()));
    expect(await checkAppUpdate(io({ autoUpdateEnabled: () => false, fetchFn: fetchFn as never }))).toEqual({
      kind: 'skipped',
      reason: 'pref-disabled',
    });
    expect(fetchFn).not.toHaveBeenCalled();

    const forced = await checkAppUpdate(io({ autoUpdateEnabled: () => false, fetchFn: fetchFn as never }), {
      force: true,
    });
    expect(forced.kind).toBe('available');
  });

  it('checks once per session unless forced', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(release()));
    const first = await checkAppUpdate(io({ fetchFn: fetchFn as never }));
    expect(first.kind).toBe('available');
    expect(sessionStorage.getItem(APP_UPDATE_SESSION_KEY)).toBe('1');

    expect(await checkAppUpdate(io({ fetchFn: fetchFn as never }))).toEqual({
      kind: 'skipped',
      reason: 'already-checked',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await checkAppUpdate(io({ fetchFn: fetchFn as never }), { force: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('fetches the GitHub release without following redirects', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(release()));
    await checkAppUpdate(io({ fetchFn: fetchFn as never }));
    expect(fetchFn).toHaveBeenCalledWith(
      APP_RELEASES_API_URL,
      expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
    );
  });

  it('reports available with the platform installer URL', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(release()));
    const result = await checkAppUpdate(io({ fetchFn: fetchFn as never, getPlatform: async () => 'win32' }));
    expect(result).toEqual({
      kind: 'available',
      currentVersion: '6.0.0',
      latestVersion: '6.1.0',
      downloadUrl: `${DOWNLOAD_BASE}/OnlyKey_6.1.0.exe`,
      releaseUrl: 'https://github.com/drewfarnese/OnlyKey-App/releases/tag/v6.1.0',
    });
  });

  it('reports available with a null installer when the platform has none', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(release({ html_url: 'https://evil.example/x' })));
    const result = await checkAppUpdate(io({ fetchFn: fetchFn as never, getPlatform: async () => 'darwin' }));
    expect(result).toMatchObject({ kind: 'available', downloadUrl: null, releaseUrl: APP_RELEASES_PAGE_URL });
  });

  it('reports current when the release is not newer', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(release({ tag_name: 'v6.0.0' })));
    expect(await checkAppUpdate(io({ fetchFn: fetchFn as never }))).toEqual({
      kind: 'current',
      currentVersion: '6.0.0',
      latestVersion: '6.0.0',
    });
  });

  it('uses the Electron bridge for version and platform by default', async () => {
    const api = { getAppVersion: async () => '6.0.0', getPlatform: async () => 'linux' };
    Object.assign(window, { electronAPI: api });
    const fetchFn = vi.fn(async () => jsonResponse(release()));
    const result = await checkAppUpdate({ isDesktop: () => true, autoUpdateEnabled: () => true, fetchFn: fetchFn as never });
    expect(result).toMatchObject({
      kind: 'available',
      currentVersion: '6.0.0',
      downloadUrl: `${DOWNLOAD_BASE}/OnlyKey_6.1.0_amd64.deb`,
    });
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  it('throws typed errors for HTTP, network, and malformed responses', async () => {
    await expect(checkAppUpdate(io({ fetchFn: (async () => jsonResponse({}, 503)) as never }))).rejects.toMatchObject({
      code: 'http-release',
      httpStatus: 503,
    });
    await expect(
      checkAppUpdate(io({ fetchFn: (async () => { throw new TypeError('offline'); }) as never })),
    ).rejects.toMatchObject({ code: 'http-release' });
    await expect(
      checkAppUpdate(io({ fetchFn: (async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } })) as never })),
    ).rejects.toMatchObject({ code: 'invalid-release' });
    await expect(
      checkAppUpdate(io({ fetchFn: (async () => jsonResponse({ tag_name: 'nightly' })) as never })),
    ).rejects.toMatchObject({ code: 'invalid-release' });
  });

  it('reads the preference from userPreferences by default', async () => {
    userPreferences.autoUpdate = false;
    const fetchFn = vi.fn();
    const result = await checkAppUpdate({ isDesktop: () => true, fetchFn: fetchFn as never });
    expect(result).toEqual({ kind: 'skipped', reason: 'pref-disabled' });
  });
});

describe('openAppUpdateDownload', () => {
  it('opens allowed URLs through the shell', async () => {
    const openExternal = vi.fn(async () => {});
    await openAppUpdateDownload(`${DOWNLOAD_BASE}/OnlyKey_6.1.0.exe`, { openExternal });
    await openAppUpdateDownload('https://github.com/drewfarnese/OnlyKey-App/releases/tag/v6.1.0', { openExternal });
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it('refuses non-HTTPS and foreign URLs', async () => {
    const openExternal = vi.fn(async () => {});
    await expect(openAppUpdateDownload('http://github.com/drewfarnese/OnlyKey-App/releases/x', { openExternal })).rejects.toBeInstanceOf(
      AppUpdateError,
    );
    await expect(openAppUpdateDownload('https://evil.example/OnlyKey.exe', { openExternal })).rejects.toMatchObject({
      code: 'host-not-allowed',
    });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('fails with io when no shell can open a URL', async () => {
    await expect(openAppUpdateDownload(APP_RELEASES_PAGE_URL, {})).rejects.toMatchObject({ code: 'io' });
  });
});
