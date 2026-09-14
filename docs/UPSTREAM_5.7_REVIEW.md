# Review: upstream `release/5.7.0-modern-rewrite` vs this fork

**Upstream:** trustcrypto/OnlyKey-App `release/5.7.0-modern-rewrite` at `9f0d723` (2026-09-12)
**Fork:** drewfarnese/OnlyKey-App `master` at `314371c`
**Reviewed:** 2026-09-14

## Status (2026-09-14)

Everything below has been implemented on this branch. Item numbers refer to
the recommendations that follow.

| Item | Status | Where |
|---|---|---|
| 1 Electron 35 to 44 | Done | `package.json`; audit now clean at every level |
| 2 Firmware check hardening (`32c3bdf`) | Done | cherry-picked, plus `isDesktopShell()` gate for Electron |
| 3 App update path | Done | rewritten against this fork's GitHub releases: `src/desktop/updater.ts`, `useAppUpdateStore`, `AppUpdateHost`, Tools card; browser download only, no in-app installer |
| 4 `44f1cb3` config-mode wipe | Done | cherry-picked |
| 5 `7368234` UNINITIALIZED inference | Done | cherry-picked |
| 6 `55f68da` + `8de8cc1` product naming | Done | cherry-picked |
| 7 `a4ef941` + `7d735ae` bootloader / Setup files | Done | cherry-picked |
| 8 `0ca84f6` tab retention | Done | cherry-picked |
| 9 CI gates | Done | lint, typecheck, audit, coverage jobs in `test.yml` |
| 10 appdmg removal | Done | `hdiutil` in `tasks/release_osx.js` |
| 11 Release matrix | Done | three-OS `release.yml`, gated on checks; macOS DMG is Apple Silicon only for now |
| 12 Dependabot | Done | `.github/dependabot.yml` |
| 13 vitest bump + overrides | Done | `package.json` |
| 14 Firmware-update flow | Done | upstream series cherry-picked, Electron `show-main-window` IPC |
| 15 Messages panel | Done | cherry-picked, verified in the sidebar layout |
| 16 AppSettings to Tools | Done | `src/components/Tools.tsx` |
| 17 NW.js cleanup + AGENTS.md | Done | `windowVisibility`, `nw.d.ts`, NW bootstrap, unmounted `AppFooter` removed |
| Fork hardening | Done | permission handlers, preload surface, production CSP |

Not done, deliberately: an in-app installer download/verify/apply (the
upstream `06a0a11` series). It needs signed installers and a manifest
pipeline first; the app opens the GitHub download in the browser instead.
`ChromeHidTransport` and `transportFactory` remain as the legacy chrome.hid
path; they are not shell code and were left alone.

## How the trees relate

The fork imported upstream's `src/` verbatim at upstream `14e297f` (2026-07-30) in #7,
then cherry-ported a block of protocol and security fixes in #12. Upstream has 113 commits
after `14e297f`. Of those, every device-protocol, key-import, OTP, PIN, hot-plug and
firmware-download fix from the Aug 15–25 burst is already in the fork (verified by a
zero remaining diff on those files). What remains is:

- seven later upstream fixes (Sep 1–12) to the device/UI layer, all portable;
- a rebuilt app-update and firmware-update subsystem (Sep 5–12) that is NW.js-shaped
  and needs an Electron adaptation rather than a copy;
- CI, dependency and packaging hygiene the fork never adopted.

The fork's own Electron-specific divergences (WebHID transport, `transportFactory`,
`sshpk` parsing in the preload, `AppSettings`, SVG icons, app-shell layout, status bar)
are intentional and should be kept.

## Current state of the fork's checks

Run on `master` with Node 22 / pnpm 9.15.4:

| Check | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | pass (62 files, 455 tests) |
| `pnpm test:coverage` | pass, all metrics above the 75% floors |
| `pnpm run build:ui` | pass |
| `pnpm audit --prod` | **fail**: 2 high, both `image-size` via `appdmg` (no fix exists) |
| `pnpm audit --audit-level=high` | **fail**: 46 advisories, 35 of them from Electron 35.7.5 |

## Recommendations, in priority order

### Tier 1: security and correctness

1. **Bump Electron from 35.7.5 to a supported line (44.x at time of writing).**
   Electron 35 is out of its support window and carries 8 high-severity advisories
   including a context-isolation bypass and renderer switch injection. This is the only
   dependency finding that ships inside the release binary. Re-test WebHID device
   selection, `disable-hid-blocklist`, tray and login-item behaviour after the bump.

2. **Port upstream `32c3bdf` (firmware: API check, numeric version compare, typed errors).**
   Two real bugs in the fork's `src/desktop/firmwareCheck.ts` and `firmwareDownload.ts`:
   - version comparison is `major*100 + minor*10 + patch`, so `v2.1.10` and `v2.2.0`
     score the same and the check can report "current" when an update exists;
   - the firmware download follows redirects to any HTTPS host. Upstream allowlists the
     request URL and the final response URL to `api.github.com`, `github.com/trustcrypto/…`
     and the three `githubusercontent.com` CDN hosts.
   Upstream also queries the GitHub API JSON instead of parsing the `/releases/latest`
   redirect, and surfaces typed `FirmwareUpdateError`s instead of logging and returning
   "no update". Applies to Electron as-is; only the `typeof nw` desktop check needs to
   become `window.electronAPI?.isDesktop`. Keep a thin `checkForNewFirmware` shim over
   the new `checkFirmwareUpdate` until item 8 lands.

3. **Fix the fork's app-update path; it is currently dead and mis-pointed.**
   `src/desktop/updater.ts` still fetches trustcrypto's S3 manifest
   (`s3.amazonaws.com/onlykey-app/releases/latest/manifest.json`). The fork is 6.0.0 and
   releases on GitHub, so the check can never fire, and if it did it would send users to
   the official NW.js installer. The `autoUpdate` preference that gates it defaults to
   false and no UI or tray item in the fork sets it. Either:
   - remove the Electron update path and the `autoUpdate` pref entirely for now, or
   - adopt upstream's design (`docs/design-app-auto-update.md`, commits `06a0a11`,
     `825a6db`, `d275faf`, `a053e61`, `dbca9c9`, `35f45fd`, `8f1e552`) with the I/O
     moved into `electron/main.js` behind IPC: `net.fetch` the manifest with
     `redirect:'error'`, stream-download to `app.getPath('temp')/onlykey-app-updates`
     while hashing, require `sha256`, treat `size` as progress only, re-hash before
     apply, spawn the installer detached and quit. Bake the fork's own manifest URL and
     emit `manifest.json` (url, size, sha256 per platform) from `release.yml`.
   The second option is the right end state but is large. The first is a one-PR fix that
   removes a misleading code path today.

4. **Port `44f1cb3` (send Advanced key wipe without guessing config mode).**
   `Advanced.tsx` refuses ECC save/wipe when the store's `isConfigMode` is false, which is
   common because config mode is inferred and the firmware reports the same `UNLOCKED`.
   Upstream drops the client-side gate and lets the device answer, and maps 3.0.4's
   "Error device locked" while unlocked to a config-mode instruction in
   `OnlyKeyDevice.formatDeviceLockedError`. Also adds `CONFIG_MODE_FOR_OPERATION` and
   `SYSADMIN_MODE_PREF_HINT` so the Sysadmin-mode paragraph only shows on the standard
   Preferences tab. Small, applies as-is.

5. **Port `7368234` (infer Classic/DUO from UNINITIALIZED status like 5.6).**
   A wiped or first-use device is typed `DeviceType.UNINITIALIZED`, so Setup runs the
   Classic keypad PIN flow for a wiped DUO. Upstream derives the hardware type from the
   status suffix and adds a separate `isInitialized` flag. Touches `deviceTypeFromStatus`,
   `ResponseParser`, `OnlyKeyDevice`, `types`, the store and reset snapshots, and six UI
   call sites that test `deviceType === DeviceType.UNINITIALIZED` (`App.tsx`,
   `Firmware.tsx`, `LockScreen.tsx` x2, `Setup.tsx`, `AppFooter.tsx`). Port protocol and
   UI halves in one change; porting only one half would misclassify wiped keys. Depends
   on `src/data/deviceProduct.ts` from item 6. Medium size, moderate risk.

6. **Port `55f68da` + `8de8cc1` (product naming helper).**
   Creates `src/data/deviceProduct.ts` (`deviceProductName`, `connectedDeviceLabel`) and
   changes "OnlyKey DUO" to "OnlyKey Duo" in copy. The sidebar bug it fixed upstream is not
   present in the fork's `AppFooter`, but the helper is a prerequisite for item 5 and
   `AppFooter` should switch to it. Small, applies as-is.

7. **Port `a4ef941` (treat self-destruct bootloader as bootloader; confirm file loads).**
   Self-destruct firmware prints `UNLOCKED BOOTLOADERv1`; the fork's parser matches
   `UNLOCKED` first, so the sidebar says Unlocked, Setup offers PIN and passphrase actions,
   and the device layer sends a stray `OKSETTIME` at the bootloader. Upstream reorders the
   BOOTLOADER branch in `ResponseParser` and `OnlyKeyDevice`. The same commit stops
   Setup's Restore and Firmware steps from starting a transfer the moment a file is picked
   (explicit file state plus a dedicated Load button) and passes a progress callback to
   the pending-firmware resume in the store. Port together with `7d735ae` (style Setup
   file choosers as app buttons). Protocol part small; Setup part is a 160-line rewrite.

8. **Port `0ca84f6` (keep current tab through config-mode lock).**
   Entering config mode is reported as a lock, and the fork's wipe branch forces
   `activeTab:'setup'`, pulling the user off Advanced or Keys just as the wipe becomes
   possible. Three-line store change, applies as-is.

### Tier 2: CI and release hygiene

9. **Adopt upstream's CI gates in `.github/workflows/test.yml`.** The fork runs only
   `pnpm test` and `build:ui`. Add jobs for `pnpm lint`, `pnpm typecheck`,
   `pnpm test:coverage` (vitest only enforces the 75% thresholds when coverage is on, so
   today they are not enforced), and `pnpm audit --prod`. All pass today except audit,
   which needs items 1 and 10. Also add `permissions: contents: read`, a `concurrency`
   group, and restrict `push` to `master` so PR branches do not double-run.

10. **Drop `appdmg` and build DMGs with `hdiutil` (upstream `e14857d`).** `appdmg` is the
    only production-path audit failure, has no fixed version, and upstream deleted it.
    `tasks/release_osx.js` is the only consumer.

11. **Make `release.yml` depend on the test job and build on a per-OS matrix.** Today a
    release can be cut from a red tree, macOS is never built, and Windows is produced by
    swapping the win32 Electron runtime into a Linux checkout. Upstream's
    `build-release.yml` matrix is the model. If item 3's second option is taken, emit and
    upload `manifest.json` here.

12. **Add `.github/dependabot.yml`** (weekly npm grouped prod/dev, plus github-actions).
    The stale Electron and action versions are exactly what this catches. Drop upstream's
    `nw` ignore rule.

13. **Bump `vitest` and `@vitest/coverage-v8` to `^4.1.11`** for the `@vitest/mocker`
    path-traversal advisory (upstream's `c159b58` did not actually fix this either).
    Add `pnpm.overrides` for `minimatch >=5.1.8`, `brace-expansion >=2.1.4` and
    `picomatch >=2.3.2` to clear the remaining devDependency advisories under
    `fs-jetpack` and `gulp`.

### Tier 3: feature ports worth doing after the above

14. **Non-blocking firmware-update flow** (`cfa5536`, `03a2631`, `fe4dc0b`, `07be15a`,
    `11735cf`, `93bbe8a`, `9f0d723`). Replaces `window.confirm` called from the HID
    status handler in `useDeviceStore.promptFirmwareUpdateIfNeeded` with a
    `useFirmwareUpdateStore` + `FirmwareUpdateHost` + `FirmwareUpdateDialog`, a shared
    `firmwareApply.ts` used by the Firmware tab, Setup step 11 and the dialog, a
    "Check now" button and an auto-check checkbox on the Firmware page. Today the
    `autoUpdateFW` pref defaults on with no UI to turn it off. Needs Electron adaptation
    (force-show-window via a new IPC instead of NW window handles; drop the `nw.Window`
    close hooks). Large, and `useDeviceStore` must be patched by hand because the fork's
    store already diverged for the transport factory.

15. **Messages panel** (`7780338`, `4c27c15`, `02bc6b8`): 50-message history, scroll
    navigation and hover popup in `DeviceMessages.tsx`. Presentation-only, applies
    as-is, but verify it fits the fork's fixed-height app-shell layout.

16. **Move `AppSettings` (launch at login, run in tray) from Preferences to Tools.**
    Preferences returns null without a connected device, so those settings are
    unreachable while disconnected. Tools is the only tab usable without a device, and
    upstream's equivalent (`AppUpdateSettings`) lives there for that reason.

17. **Delete leftover NW.js code paths** rather than maintaining both: the NW branch of
    `updater.ts`, `windowVisibility.ts`, the NW branch of `initDesktop.ts`, the NW
    bootstrap in `index.html`, `src/types/nw.d.ts`, the `nw`/`chrome` globals in
    `eslint.config.mjs`, and stale comments (`vitest.config.ts` references a mocha
    `test/` suite that does not exist; `.vscode/launch.json` points at a missing `app/`).
    Port the layout and constraints sections of upstream's `AGENTS.md` with Electron
    substitutions.

### Fork-specific hardening (not from upstream)

- `electron/main.js` `setPermissionCheckHandler` returns `true` for every permission,
  not just HID. Return `false` for anything other than `hid`.
- `electron/preload.js` exposes `nodeRequire.getAutoLaunch` (a raw `require`) and
  `path.join` to the renderer. Nothing in `src/` uses them; remove.
- `webPreferences.sandbox: false` is set for the preload's `sshpk` require. Consider
  moving the SSH key parse to the main process via IPC so the renderer can be sandboxed.

## Do not port

- Anything under `desktopBg.cjs`, `desktopInject.js`, `userPreferences.cjs`,
  `main.cjs`, `scripts/*.mjs` (NW.js launch, tray verify, macOS universal DMG),
  `tests/desktop/`, `docs/desktop-tray.md`.
- `src/desktop/appRoot.ts`, the `_onlykeySuppressShow` window mechanism,
  `readLocalAppPackage`'s `nw.App.manifest` probing.
- `d73475b` (`index.html` appRoot search for `desktopBg.cjs`).
- Upstream's emoji nav icons, sidebar "App vX" row (the fork's status bar already shows
  the version), and the 0e6bc3a transitional Tools firmware card.

## Suggested sequencing

1. Electron bump + audit fixes + CI gates (items 1, 9, 10, 12, 13). One PR, mostly config.
2. Firmware check/download hardening (item 2). One PR.
3. Small protocol/UI fixes (items 6, 5, 7 protocol half, 4, 8). One or two PRs.
4. Decide on app updates (item 3): remove now, design the Electron IPC version later.
5. Setup rewrite from `a4ef941` + `7d735ae` (item 7 UI half).
6. Firmware-update flow (item 14), then messages panel and AppSettings move.
