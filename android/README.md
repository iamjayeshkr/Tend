# Tend Android

Tend's shared UI is bundled inside an Android application. Its core never needs the internet. This Java shell has no external runtime libraries and does **not** request `INTERNET`. It serves only bundled assets from `https://appassets.androidplatform.net` with a restrictive content policy; external documents, frames, file URLs, popups and remote navigation are denied. Production WebView debugging is disabled.

## Build a signed APK

Requirements: Node.js, JDK 17 or 21, Android SDK platform 36, build-tools 36.0.0, platform-tools, and accepted SDK licenses. Gradle 8.13 is pinned by the checked-in wrapper; Android Gradle Plugin is 8.13.2. The first build downloads build dependencies. The installed application does not.

```sh
npm ci
bash scripts/android-build.sh
```

The script discovers a local JDK/SDK without altering your shell configuration. You can set `JAVA_HOME` and `ANDROID_HOME` explicitly. It builds the web bundle, copies it into Android assets, compiles and shrinks the release application, runs Android release lint, signs it, and verifies the APK signature. Output: `releases/Tend-1.0.0.apk` and its SHA-256 checksum. `--skip-web` uses an already built `dist` directory.

Minimum Android: 8.0 (API 26). Target: Android 16 (API 36). Native code has no bundled `.so` libraries, avoiding application-specific native page-size dependencies.

The first release build generates a local RSA signing identity in `android/release-signing/tend-release.jks`; passwords are stored in `android/signing.properties`. Both are excluded from version control. **Keep an encrypted backup of both files. Future updates must use the same key.** The script will not replace a surviving key if its configuration is missing. Losing the key means a replacement installation would need a new application identity or require uninstalling the old application. Do not publish signing files or include them in a source archive.

## Native bridge

The locally bundled UI receives `window.AndroidBridge`:

| Method | Result / behavior |
| --- | --- |
| `loadState()` | Full JSON snapshot, `null` for first use, or `__TEND_STORAGE_READ_ERROR__` on read failure. A read failure locks native writes until restart. |
| `saveState(json)` | Boolean success, only after an atomic SQLite transaction. A previous snapshot is retained in the database. Invalid JSON is rejected. |
| `getCapabilities()` | JSON with `platform`, `notifications`, `usageAccess`, and `exactAlarms`. |
| `requestPermission(kind)` | User-invoked Android UI for `notifications`, `usage`, or `alarms`. |
| `getUsage()` | JSON with `granted`, `apps`, `available`, and `updatedAt` where available. App entries have package name, display name and today's foreground minutes. |
| `configureLimits(json)` | `{enabled, instagram, youtube}` daily budgets, with Android periodic reminders. |
| `scheduleAlarm(id, HH:mm, label)` | Persists and schedules a daily alarm, returning success. |
| `cancelAlarm(id)` | Cancels both the OS alarm and persisted schedule. |
| `scheduleTimer(endMs, title)` / `cancelTimer()` | One native timer completion alert, with reboot recovery. |
| `saveBackup(json)` | User selects a destination through Android's document picker. |
| `importBackup()` | User selects a JSON file, dispatched as `tend-backup-import` with JSON string detail for UI validation and preview. |
| `openNotificationSettings()` | Opens Android's notification configuration for Tend. |

Events: `tend-native-ready`, `tend-capabilities-changed`, `tend-native-error`, `tend-backup-exported`, `tend-backup-import`. `tend-back` is cancelable: the UI can prevent default and dismiss an open sheet or return to Today before Android exits. Service-worker registration should be skipped inside Android because its assets are already bundled; the PWA uses a service worker independently.

Backups and snapshots are capped at 25 MB. Export uses a temporary private file so document-picker recreation is recoverable. Backup import parses JSON natively, then delegates application schema validation and the restore decision to the UI. No general storage permission is requested. Android cloud/device-transfer backup is disabled; use Tend's explicit export.

## Capabilities and limits

- Routine alarms and focus completion use `AlarmManager` and notification channels, including the system alarm sound for routine alarms. Notifications must be granted. Android 12+ exact-alarm access must be enabled for precise timing. Without it, alarms use an inexact fallback and Android may delay delivery.
- These are notification alarms, not a full-screen continuously ringing alarm-clock service with snooze/dismiss actions. Sound, notification channel settings, Do Not Disturb and manufacturer behavior can affect the alert. Verify wake-up reliability on the intended device before relying on it.
- Daily schedules restore after boot, app upgrade, time/timezone changes, and exact-alarm access grants. Android force-stop blocks background delivery until the app is reopened. Powered-off devices cannot deliver alerts.
- Usage access is optional and user-granted. Instagram, YouTube, and Chrome foreground activity is derived from Android usage events across local midnight. Device event retention and multi-window behavior can affect totals.
- App budgets use `JobScheduler` at a minimum 15-minute interval. Battery policies may delay checks further. Reminders are deduplicated by date, app and warning level. Changing a budget resets its warning level. This version **does not block apps** or draw over other apps.
- The app requests no accessibility, overlay, location, contacts, camera, microphone or network access. No advertising, analytics or crash-upload SDKs are included.

## Native checks

With an isolated Android emulator or test device connected:

```sh
bash scripts/android-test.sh
```

The script builds and installs `app.tend.debug` plus its test APK. The instrumentation checks SQLite save/reopen, invalid-write protection, alarm input validation, schedule persistence/restore/cancel, usage API response shape, notification channel creation, and a real exact timer receiver/notification. It resets only its isolated debug database. It does not modify the signed `app.tend` installation.

A successful emulator test does not establish manufacturer-specific physical-device behavior. Test notification permissions, alarm sound/lockscreen delivery, denied/revoked exact access, real usage totals, overnight boundaries, reboot, battery saver, backup picker flows, process recreation and a signed in-place update on the intended phone before wider distribution.

## Android references

- [Alarm scheduling and exact access](https://developer.android.com/develop/background-work/services/alarms)
- [Local WebView content and origin security](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [UsageStatsManager](https://developer.android.com/reference/android/app/usage/UsageStatsManager)
- [JobInfo and periodic scheduling](https://developer.android.com/reference/android/app/job/JobInfo)
- [Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)
- [Android Gradle Plugin 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
