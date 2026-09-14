import { userPreferences } from './userPreferences';
import { isDesktopShell } from '../utils/platform';

/**
 * App update check for the Electron shell.
 *
 * This fork publishes installers as GitHub Releases, so the check reads the
 * latest release from the GitHub API, compares its tag with the running app
 * version, and offers to open the platform installer in the system browser.
 * Nothing is downloaded or executed in-app: the browser download is the
 * user's own action, and only HTTPS URLs under this repository's release
 * download path are ever handed to the shell.
 */

export const APP_RELEASES_REPO = 'drewfarnese/OnlyKey-App';
export const APP_RELEASES_API_URL = `https://api.github.com/repos/${APP_RELEASES_REPO}/releases/latest`;
export const APP_RELEASES_PAGE_URL = `https://github.com/${APP_RELEASES_REPO}/releases/latest`;
const ALLOWED_DOWNLOAD_PREFIX = `https://github.com/${APP_RELEASES_REPO}/releases/download/`;

export const APP_UPDATE_SESSION_KEY = 'ok-app-update-checked-session';

export type AppUpdateErrorCode =
  | 'http-release'
  | 'invalid-release'
  | 'not-https'
  | 'host-not-allowed'
  | 'io';

export class AppUpdateError extends Error {
  readonly code: AppUpdateErrorCode;
  readonly httpStatus?: number;

  constructor(message: string, code: AppUpdateErrorCode, httpStatus?: number) {
    super(message);
    this.name = 'AppUpdateError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface AppUpdateIo {
  fetchFn?: typeof fetch;
  isDesktop?: () => boolean;
  autoUpdateEnabled?: () => boolean;
  getAppVersion?: () => Promise<string>;
  getPlatform?: () => Promise<string>;
  openExternal?: (url: string) => Promise<void>;
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  abortSignal?: AbortSignal;
}

export type AppUpdateCheckResult =
  | { kind: 'skipped'; reason: 'not-desktop' | 'pref-disabled' | 'already-checked' }
  | { kind: 'current'; currentVersion: string; latestVersion: string }
  | {
      kind: 'available';
      currentVersion: string;
      latestVersion: string;
      /** HTTPS installer URL for this platform, or null when the release has none. */
      downloadUrl: string | null;
      releaseUrl: string;
    };

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Only installers published under this repository's releases may be opened. */
export function isAllowedDownloadUrl(url: string): boolean {
  if (!isHttpsUrl(url)) return false;
  return url.startsWith(ALLOWED_DOWNLOAD_PREFIX) || url === APP_RELEASES_PAGE_URL;
}

export function platformInstallerExtension(platform: string): string | null {
  if (platform === 'win32') return '.exe';
  if (platform === 'darwin') return '.dmg';
  if (platform === 'linux') return '.deb';
  return null;
}

function electronApi() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

function sessionGet(io: AppUpdateIo, key: string): string | null {
  try {
    return (io.sessionStorage ?? sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(io: AppUpdateIo, key: string, value: string): void {
  try {
    (io.sessionStorage ?? sessionStorage).setItem(key, value);
  } catch {
    /* ignore */
  }
}

async function currentAppVersion(io: AppUpdateIo): Promise<string> {
  if (io.getAppVersion) return io.getAppVersion();
  const api = electronApi();
  if (api?.getAppVersion) {
    try {
      const v = await api.getAppVersion();
      if (v) return v;
    } catch {
      /* fall through to the build-time version */
    }
  }
  return __APP_VERSION__;
}

async function currentPlatform(io: AppUpdateIo): Promise<string> {
  if (io.getPlatform) return io.getPlatform();
  const api = electronApi();
  if (api?.getPlatform) {
    try {
      return await api.getPlatform();
    } catch {
      /* fall through */
    }
  }
  return typeof process !== 'undefined' && process.platform ? process.platform : '';
}

interface GithubReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface GithubRelease {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
}

export function pickInstallerAsset(release: GithubRelease, platform: string): string | null {
  const ext = platformInstallerExtension(platform);
  if (!ext || !Array.isArray(release.assets)) return null;
  for (const asset of release.assets as GithubReleaseAsset[]) {
    const name = typeof asset?.name === 'string' ? asset.name : '';
    const url = typeof asset?.browser_download_url === 'string' ? asset.browser_download_url : '';
    if (!name.toLowerCase().endsWith(ext)) continue;
    if (!isAllowedDownloadUrl(url)) {
      console.warn(`App update: ignoring installer outside the release download path: ${url}`);
      continue;
    }
    return url;
  }
  return null;
}

export async function checkAppUpdate(
  io: AppUpdateIo = {},
  opts?: { force?: boolean },
): Promise<AppUpdateCheckResult> {
  const force = !!opts?.force;

  if (!(io.isDesktop ?? isDesktopShell)()) {
    return { kind: 'skipped', reason: 'not-desktop' };
  }
  if (!force && !(io.autoUpdateEnabled ?? (() => userPreferences.autoUpdate))()) {
    return { kind: 'skipped', reason: 'pref-disabled' };
  }
  if (!force && sessionGet(io, APP_UPDATE_SESSION_KEY)) {
    return { kind: 'skipped', reason: 'already-checked' };
  }

  const fetchFn = io.fetchFn ?? fetch.bind(globalThis);
  const [currentVersion, platform] = await Promise.all([currentAppVersion(io), currentPlatform(io)]);

  let res: Response;
  try {
    res = await fetchFn(APP_RELEASES_API_URL, {
      cache: 'no-store',
      redirect: 'error',
      signal: io.abortSignal,
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch (e) {
    throw new AppUpdateError(`Release check failed: ${String(e)}`, 'http-release');
  }
  if (!res.ok) {
    throw new AppUpdateError(`Release check failed: HTTP ${res.status}`, 'http-release', res.status);
  }

  let release: GithubRelease;
  try {
    release = (await res.json()) as GithubRelease;
  } catch {
    throw new AppUpdateError('Release response was not valid JSON', 'invalid-release');
  }
  const tag = typeof release?.tag_name === 'string' ? release.tag_name.trim() : '';
  if (!/^v?\d+(\.\d+){0,2}/.test(tag)) {
    throw new AppUpdateError('Release response has no usable tag', 'invalid-release');
  }
  const latestVersion = tag.replace(/^v/i, '');

  if (!force) sessionSet(io, APP_UPDATE_SESSION_KEY, '1');

  if (compareSemver(latestVersion, currentVersion) <= 0) {
    return { kind: 'current', currentVersion, latestVersion };
  }

  const pageUrl = typeof release.html_url === 'string' ? release.html_url : '';
  const releaseUrl = isAllowedDownloadUrl(pageUrl) || pageUrl.startsWith(`https://github.com/${APP_RELEASES_REPO}/releases/tag/`)
    ? pageUrl
    : APP_RELEASES_PAGE_URL;

  return {
    kind: 'available',
    currentVersion,
    latestVersion,
    downloadUrl: pickInstallerAsset(release, platform),
    releaseUrl,
  };
}

/** Hand an installer or release-page URL to the system browser. */
export async function openAppUpdateDownload(url: string, io: AppUpdateIo = {}): Promise<void> {
  if (!isHttpsUrl(url)) {
    throw new AppUpdateError('Refusing to open a non-HTTPS update URL', 'not-https');
  }
  const isReleasePage = url.startsWith(`https://github.com/${APP_RELEASES_REPO}/releases/`);
  if (!isAllowedDownloadUrl(url) && !isReleasePage) {
    throw new AppUpdateError('Refusing to open an update URL outside this app\'s releases', 'host-not-allowed');
  }
  const open = io.openExternal ?? electronApi()?.openExternal;
  if (!open) {
    throw new AppUpdateError('No desktop shell available to open the download', 'io');
  }
  await open(url);
}
