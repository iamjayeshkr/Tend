# Tend Testing Guide

This is the canonical command guide for the recovered Tend 1.1.14 baseline. A check is **verified** only when it is run against the current source and exits successfully. Historical reports and screenshots are comparison evidence, not pass evidence. A skipped check remains skipped, and emulator output must not be reported as physical-device verification.

## Prerequisites

- Node.js 20.19.x or 22.12+ and npm
- Chromium for Playwright (`npx playwright install chromium` if it is not already available)
- For Android: JDK 17 or 21, Android SDK platform 36, build-tools 36.0.0, platform-tools, and accepted SDK licenses
- For Android instrumentation: an isolated emulator or test device visible to `adb`

## Clean web verification

Run from the repository root:

```sh
npm ci
npm run typecheck
npm test
node --test scripts/verify-assets.test.mjs
npm run build
npm run verify:assets
npm run test:e2e
npm audit --audit-level=high
```

Expected coverage:

- `npm test`: schema-1 validation, persistence failure behavior, write serialization, timers, calendar accounting, backups, and complete/legacy/active/paused compatibility fixtures.
- Asset verifier tests: missing hashed file rejection, recursive HTML/CSS/manifest/service-worker validation, and bundle-root traversal rejection.
- `npm run build`: TypeScript, production Vite bundle, service worker, and local asset resolution.
- `npm run test:e2e`: Chromium phone and 1440×1000 desktop journeys, including onboarding, four destinations, focus reload/pause/finish, notebook edit/delete/undo, backup safety, offline reload, keyboard/reduced-motion access, browser protection disclosure, and mocked Android consent.
- Audit: no high or critical vulnerability. The recovery lockfile selects `source-map-js` 1.2.2.

Playwright owns its preview server unless port 4173 already has a compatible Tend preview. Failure traces and screenshots are written under ignored `artifacts/test-results` and `artifacts/playwright-report` paths.

## Generated bundle checks

The production build runs the web check automatically. It can also be invoked directly:

```sh
node scripts/verify-assets.mjs dist/index.html dist
```

The verifier follows local script, stylesheet/font, icon, manifest, service-worker, and precache references. It ignores remote URLs, does not fetch the network, and rejects references or symlinks that escape the bundle root.

`scripts/android-build.sh` verifies `dist`, copies it into the ignored Android asset directory, and verifies the copied bundle again before Gradle packaging.

## Android static checks

```sh
./android/gradlew -p android --no-daemon \
  :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
```

This proves compilation and lint only. It does not prove permission UX, notification delivery, protection behavior, reboot recovery, or OEM battery behavior.

## Android instrumentation

Start an isolated emulator or connect a test phone, then run:

```sh
bash scripts/android-test.sh
```

The script installs only `app.tend.debug` and its test package. It checks SQLite reopen and invalid-write protection, alarm persistence/restore/cancel, usage response shape, notification channel creation, and exact timer delivery. Notification and exact-alarm access must be grantable on the target.

The protection-specific API 34 recovery checks use the same instrumentation runner:

```sh
adb shell am instrument -w -e mode protection-default \
  app.tend.debug.test/app.tend.NativeSmokeTest
adb shell am instrument -w -e mode protection-tasks \
  app.tend.debug.test/app.tend.NativeSmokeTest
adb shell am instrument -w -e mode protection-activity \
  app.tend.debug.test/app.tend.NativeSmokeTest
```

These modes validate opt-in policy, selected-package behavior, deliberate local exceptions, timer/task/cooldown rules, activity recreation, owner disablement, and service dismissal. A manual emulator smoke may additionally enable the debug accessibility service and open a selected test application. Disable the debug service and protection after the run.

## Physical-device-only gates

Before a public Android release, test on each intended device/OEM:

- notification permission denied/granted and alarm sound on locked/unlocked screens;
- exact-alarm denial, revocation, and inexact fallback;
- reboot, time/timezone change, force-stop, battery saver, and process recreation;
- real usage totals, multi-window behavior, and local-midnight boundaries;
- Accessibility consent/revocation, selected-app interception, settings/home exits, and temporary break timing;
- backup document picker export/import and signed in-place upgrade using the preserved signing identity.

Until those checks are recorded, report Android protection and timing as emulator-verified only.

## Evidence hygiene

Before committing or releasing:

```sh
git diff --check
git status --short
```

Do not stage `dist/`, copied Android web assets, Gradle reports/builds, Playwright output, APKs, `.idsig` files, local SDK properties, signing properties, keystores, credentials, or real journal/backup data. Use only synthetic test content.
