# AGENTS.md — OnlyKey App (community fork)

Agent instructions for this repository. Firmware lives in a separate
repository and is read-only from here.

## Overview

Desktop app for OnlyKey hardware: setup, slots, PGP/SSH keys, backup/restore,
firmware, and preferences. This fork replaced the NW.js shell of the official
app with Electron; `src/` is otherwise shared lineage with
trustcrypto/OnlyKey-App `release/5.7.0-modern-rewrite`
(see `docs/UPSTREAM_5.7_REVIEW.md` for what has been ported).

- **Runtime:** Electron (see `devDependencies.electron`), pnpm
- **Frontend:** React 19 + TypeScript, Zustand, Tailwind 4, Vite 7
- **Device I/O:** WebHID (`navigator.hid`) via `WebHidTransport`; the main
  process auto-grants HID permission for OnlyKey vendor/product IDs
- **Tests:** vitest with happy-dom (unit + UI); no hardware required

## Commands

```bash
pnpm install
pnpm run start:ui     # vite build + launch Electron
pnpm dev              # Vite dev server; then: VITE_DEV_SERVER_URL=http://localhost:5173 pnpm start
pnpm lint
pnpm typecheck
pnpm test             # all vitest suites
pnpm test:coverage    # enforces the 75% floors in vitest.config.ts (CI runs this)
pnpm audit --audit-level=high
pnpm run release      # installer for the current OS into releases/
```

Append `?mock=1` to the renderer URL (or set `VITE_MOCK_DEVICE=true`) to run
against `MockTransport` without a device.

## Layout

- `electron/main.js` — main process: window, tray, login item, HID
  permission handlers, IPC (`open-external`, `show-main-window`, startup
  settings)
- `electron/preload.js` — the only bridge into the renderer
  (`window.electronAPI`, typed in `src/types/electron-api.d.ts`)
- `src/api/device/` — OnlyKey protocol (`OnlyKeyDevice`, parsers, types)
- `src/api/transport/` — WebHID, chrome.hid (legacy), and mock transports
- `src/components/`, `src/store/`, `src/services/`
- `src/desktop/` — renderer-side desktop modules: app update check
  (`updater.ts`, GitHub releases of this fork), firmware check/download/apply,
  user preferences (localStorage)
- `src/test/` — vitest helpers (not the test suites)
- `tasks/` — gulp build and per-OS release packaging (NSIS, dpkg-deb, hdiutil)
- `resources/` — icons, NSIS script, udev rules, Debian control files
- `.github/workflows/` — `test.yml` gates (lint, typecheck, audit, coverage);
  `release.yml` three-OS installer matrix

## Constraints

- Talk to the device only through `OnlyKeyDevice`; no raw HID from UI.
- Device state lives in `useDeviceStore`; app/firmware update state in
  `useAppUpdateStore` / `useFirmwareUpdateStore`.
- Message and field IDs: enums in `src/api/device/types.ts`.
- Anything that needs Node (fs, child_process, spawning installers) belongs in
  `electron/main.js` behind an IPC handler, never in the renderer. Extend
  `preload.js` and `electron-api.d.ts` together.
- The renderer never downloads or executes app installers. The app update
  check only opens HTTPS URLs under this repository's GitHub release path.
- Firmware downloads must carry a SHA-256 from the GitHub release and only
  come from the allowlisted GitHub hosts in `firmwareDownload.ts`.
- Keep the 75% coverage floors; add tests next to the code under `__tests__/`.

## HID protocol (app → firmware)

64-byte raw HID packets.

| Offset | Size | Description |
|--------|------|-------------|
| 0–3 | 4 | Header `0xFF 0xFF 0xFF 0xFF` |
| 4 | 1 | MessageID |
| 5 | 1 | SlotID (0–24 or system-wide) |
| 6 | 1 | FieldID |
| 7–63 | 57 | Payload, zero-padded |

Common MessageIDs: `0xE1` OKSETPIN, `0xE4` OKSETTIME, `0xE5` OKGETLABELS,
`0xE6` OKSETSLOT, `0xE7` OKWIPESLOT, `0xF4` OKFWUPDATE.

Device replies are 64-byte reports, usually ASCII: `UNLOCKEDv…`,
`INITIALIZED`, `UNINITIALIZED`, `LOCKED`, `slotId|label`, or `Error`/`ERROR`.
