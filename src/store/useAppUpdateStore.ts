import { create } from 'zustand';
import {
  AppUpdateError,
  type AppUpdateCheckResult,
  type AppUpdateErrorCode,
  checkAppUpdate,
  openAppUpdateDownload,
} from '../desktop/updater';
import { AUTO_UPDATE_PREF_EVENT, userPreferences } from '../desktop/userPreferences';

export type AppUpdatePhase = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error';

export function appUpdateUserMessage(code: AppUpdateErrorCode, httpStatus?: number): string {
  switch (code) {
    case 'http-release':
      return httpStatus != null
        ? `Could not reach the release server (HTTP ${httpStatus}).`
        : 'Could not reach the release server.';
    case 'invalid-release':
      return 'The release information could not be read.';
    case 'not-https':
    case 'host-not-allowed':
      return 'Update refused: the download location is not this app\'s release page.';
    default:
      return 'App update check failed.';
  }
}

export interface AppUpdateState {
  phase: AppUpdatePhase;
  autoCheck: boolean;
  promptVisible: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  downloadUrl: string | null;
  releaseUrl: string | null;
  error: string | null;
  errorCode: AppUpdateErrorCode | null;
}

const initialState: AppUpdateState = {
  phase: 'idle',
  autoCheck: true,
  promptVisible: false,
  currentVersion: null,
  latestVersion: null,
  downloadUrl: null,
  releaseUrl: null,
  error: null,
  errorCode: null,
};

let inFlight: Promise<void> | null = null;
let abortController: AbortController | null = null;

function isBusy(): boolean {
  return inFlight != null || useAppUpdateStore.getState().phase === 'checking';
}

function beginAbort(timeoutMs: number): AbortSignal {
  abortController?.abort();
  abortController = new AbortController();
  const ac = abortController;
  setTimeout(() => {
    if (abortController === ac) ac.abort();
  }, timeoutMs);
  return ac.signal;
}

export function hydrateAutoUpdate(): void {
  useAppUpdateStore.setState({ autoCheck: userPreferences.autoUpdate });
}

/** Keep `autoCheck` in step with the preference, and start a check when it turns on. */
export function bindAutoUpdatePrefListeners(): () => void {
  hydrateAutoUpdate();
  const onChange = () => {
    const wasOn = useAppUpdateStore.getState().autoCheck;
    hydrateAutoUpdate();
    if (useAppUpdateStore.getState().autoCheck && !wasOn) void startAutoCheck();
  };
  window.addEventListener('focus', onChange);
  window.addEventListener(AUTO_UPDATE_PREF_EVENT, onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    window.removeEventListener(AUTO_UPDATE_PREF_EVENT, onChange);
  };
}

function presentAvailable(result: Extract<AppUpdateCheckResult, { kind: 'available' }>): void {
  useAppUpdateStore.setState({
    phase: 'available',
    promptVisible: true,
    currentVersion: result.currentVersion,
    latestVersion: result.latestVersion,
    downloadUrl: result.downloadUrl,
    releaseUrl: result.releaseUrl,
    error: null,
    errorCode: null,
  });
}

function presentError(code: AppUpdateErrorCode, prompt: boolean, httpStatus?: number): void {
  useAppUpdateStore.setState({
    phase: 'error',
    promptVisible: prompt,
    errorCode: code,
    error: appUpdateUserMessage(code, httpStatus),
  });
}

async function runCheck(force: boolean): Promise<void> {
  useAppUpdateStore.setState({ phase: 'checking', error: null, errorCode: null, promptVisible: false });
  try {
    const result = await checkAppUpdate({ abortSignal: beginAbort(15_000) }, { force });
    if (result.kind === 'available') {
      presentAvailable(result);
      return;
    }
    if (result.kind === 'current') {
      if (!force) {
        console.info(`App update: ${result.currentVersion} is current (latest ${result.latestVersion})`);
      }
      useAppUpdateStore.setState({
        phase: force ? 'up-to-date' : 'idle',
        promptVisible: force,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        downloadUrl: null,
        releaseUrl: null,
      });
      return;
    }
    console.info(`App update: auto-check skipped (${result.reason})`);
    useAppUpdateStore.setState({ phase: 'idle', promptVisible: false });
  } catch (e) {
    const err = e instanceof AppUpdateError ? e : new AppUpdateError(String(e), 'io');
    if (!force) console.error('App update check failed:', err);
    // Only a user-initiated check gets a modal; a failed startup check is
    // shown on the Tools card and logged.
    presentError(err.code, force, err.httpStatus);
  }
}

function track(run: Promise<void>): Promise<void> {
  const tracked = run.finally(() => {
    if (inFlight === tracked) inFlight = null;
  });
  inFlight = tracked;
  return tracked;
}

export async function startAutoCheck(): Promise<void> {
  hydrateAutoUpdate();
  if (!useAppUpdateStore.getState().autoCheck) {
    console.info('App update: auto-check skipped (pref-disabled)');
    return;
  }
  if (isBusy()) return;
  return track(runCheck(false));
}

export async function checkNow(): Promise<void> {
  if (isBusy()) return;
  return track(runCheck(true));
}

/** Open the installer (or the release page when no installer matches) in the browser. */
export async function openDownload(): Promise<void> {
  const { phase, downloadUrl, releaseUrl } = useAppUpdateStore.getState();
  if (phase !== 'available') return;
  const url = downloadUrl ?? releaseUrl;
  if (!url) return;
  try {
    await openAppUpdateDownload(url);
    useAppUpdateStore.setState({ promptVisible: false });
  } catch (e) {
    const err = e instanceof AppUpdateError ? e : new AppUpdateError(String(e), 'io');
    presentError(err.code, true, err.httpStatus);
  }
}

export function dismissUpdatePrompt(): void {
  if (useAppUpdateStore.getState().phase === 'checking') return;
  useAppUpdateStore.setState({ promptVisible: false });
}

export function setAutoCheck(value: boolean): void {
  const wasOn = useAppUpdateStore.getState().autoCheck;
  userPreferences.autoUpdate = value;
  hydrateAutoUpdate();
  if (value && !wasOn) void startAutoCheck();
}

export function abortAppUpdateFetches(): void {
  abortController?.abort();
  abortController = null;
}

export function resetAppUpdateStoreForTests(): void {
  abortAppUpdateFetches();
  inFlight = null;
  useAppUpdateStore.setState({ ...initialState, autoCheck: userPreferences.autoUpdate });
}

export const useAppUpdateStore = create<AppUpdateState>(() => ({ ...initialState }));
