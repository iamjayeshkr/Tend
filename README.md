# Tend

Tend 1.1.14 is an offline-first personal planner, focus timer, notebook, routine tracker, and reflection journal. The recovered application has four destinations—Today, Focus, Notebook, and You—and keeps its journal on the current device.

## Current product boundary

- The browser build works as an installable offline web app after its first local load. It stores data in IndexedDB and can export or restore a JSON backup.
- The Android build bundles the same interface and stores snapshots in local SQLite. It also provides local alarms, widgets, usage summaries, and optional owner-enabled app protection.
- Browser/desktop protection is explanatory UI only. A browser cannot intercept other native applications.
- There are no user accounts, cloud synchronization, remote analytics, ads, backend service, or Tauri desktop installer in this baseline. “Desktop” currently means the browser experience running at a desktop viewport.

## Run the desktop browser version

Use Node.js 20.19.x or 22.12+ and npm.

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`. For live development, use `npm run dev` instead.

## Verify the repository

The canonical test commands and evidence rules are in [docs/TESTING.md](docs/TESTING.md). The short web check is:

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --audit-level=high
```

Generated bundles, reports, APKs, signing files, local SDK paths, and test output are intentionally excluded from Git.

## Android

Android requires JDK 17 or 21 plus Android SDK platform/build-tools 36. Build and permission details are in [android/README.md](android/README.md). The debug compile gate is:

```sh
./android/gradlew -p android --no-daemon \
  :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
```

`scripts/android-test.sh` additionally requires an isolated emulator or test device. Emulator results do not establish alarm, battery, OEM, or accessibility behavior on a physical phone.

## Data safety

Tend has no server copy of the journal. Export a backup before clearing browser data, uninstalling Android, changing devices, or testing a restore. Android protection settings and temporary exceptions are device-local and are not included in the journal backup.

## Recovery record

This branch restores a previously incomplete repository without beginning the larger Tend 2.0 account/sync/desktop-native roadmap. See [docs/RECOVERY_PROVENANCE.md](docs/RECOVERY_PROVENANCE.md), [AUDIT.md](AUDIT.md), and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
