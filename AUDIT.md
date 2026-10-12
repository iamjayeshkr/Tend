# Tend 2.0 Repository Audit

**Audit date:** 12 October 2026

**Audited revision:** `9756540` (`main`, matching `origin/main`)

**Repository:** Tend 1.1.14 recovery baseline

## Executive summary

This repository contains substantial Tend 1.1 product work, but it is not a runnable or releasable baseline in its current committed state. The React entry point, the main application component, two global style sheets, an Android lock activity, and the browser end-to-end tests are missing. Both the web build and Android compilation fail. The generated web bundle embedded in Android is also incomplete: its HTML references JavaScript and CSS assets that do not exist.

The surviving code is not a generic starter. It preserves Tend's warm paper visual language, offline state engine, notebook, focus/accounting logic, Android WebView shell, native SQLite snapshot storage, alarms, widgets, usage monitoring, and opt-in accessibility-based protection. Those assets and contracts should be recovered and evolved rather than replaced.

Tend 2.0's account, backend, cross-device synchronization, Tauri desktop application, career roadmap, projects, courses, habits, and job-application workspace do not exist yet. Preliminary protocol/quiz types from an older Tend 2.0 direction exist but are not integrated into storage or UI.

## Repository and history

- Git is initialized and clean on `main`.
- The repository has only two commits. The application was imported in one large commit, so the current Git history cannot restore omitted files.
- The latest commit is named `feat: complete Tend production application`, but the checked-in application does not build. The commit message is not reliable release evidence.
- The remote is configured and `main` matches `origin/main`.
- Generated output, local Android SDK configuration, release signing material, and APKs are ignored.
- Existing release signing material is present locally with owner-only permissions and was not printed or added to Git. It must be preserved for Android update compatibility.

## Current architecture

### Shared React application

- React 19, TypeScript 5.9, and Vite 7.
- A single-device schema-1 `AppState` contains routine blocks, tasks, activities, notebook ideas/pages, reviews, workout sets, focus timer state, wake/sleep logs, and settings.
- Browser persistence uses IndexedDB, with localStorage only when IndexedDB is unavailable.
- Android persistence uses a JavaScript bridge to atomically store a complete JSON snapshot in SQLite. The previous snapshot is retained as row 2.
- JSON backup import validates size, shape, ranges, duplicate IDs, dates, intervals, and allowed values before replacing live data.
- There is no repository abstraction, operation log, tombstone model, record revision model, or remote synchronization adapter.

### Android shell

- Native Java application with minimum SDK 26 and target/compile SDK 36.
- A hardened local-origin WebView serves bundled assets from `https://appassets.androidplatform.net` without requesting the Android Internet permission.
- Native capabilities include SQLite snapshots, alarms, notifications, document-picker backup/restore, usage monitoring, widgets, activity/sleep signals, and an opt-in accessibility protection service.
- The package name is `app.tend`. Version name is 1.1.14 and version code is 16.
- The current Android dependency graph is small at the top level: Google Play Services Location 21.3.0 plus its transitive AndroidX/Kotlin dependencies.
- There is no Kotlin module, shared native database abstraction, Android account/session layer, background sync worker, or secure token storage.

### Desktop and backend

- No Tauri configuration, Rust source, desktop SQLite layer, installer configuration, or desktop-native command tests exist.
- No API service, Node server, PostgreSQL schema, ORM, migration, authentication, device, sync, OpenAPI, or deployment configuration exists.
- No monorepo workspace configuration or shared packages exist.

## Working and preserved functionality

The following source is present and has meaningful implementation:

- Calendar-aware local day statistics, overlap handling, cross-midnight intervals, focus accounting, and pause reconstruction.
- Strict backup parsing and state validation.
- Serialized local writes with IndexedDB and Android SQLite adapters.
- Notebook page editing, search, pinning, autosave, local recovery drafts, deletion, and undo UI.
- Protection settings UI and native configuration bridge.
- Native alarms, notifications, usage monitoring, widgets, quick task entry, protection state, wake-confidence logic, and boot restoration code.
- Existing product illustrations, icons, screenshots, warm paper surfaces, forest-green palette, Fraunces/DM Sans/Caveat typography, and the Today/Focus/Notebook/You navigation identity.
- Local Android signing identity is preserved outside version control.

The surviving unit suite passed during this audit:

```text
Test files: 1 passed
Tests:      35 passed
Command:    npm test
```

These tests cover the schema-1 state engine, timer segments, calendar calculations, backup validation, storage fallbacks, write ordering, log windows, and protection settings. They do not prove that the app UI launches because the application entry source is missing.

## Broken baseline

### Web build

`npm run build` fails during TypeScript compilation:

```text
src/main.tsx(10,17): error TS2307: Cannot find module './App'
```

The entry point also imports two absent files:

- `src/App.tsx`
- `src/styles.css`
- `src/experience.css`

The ignored `dist/index.html` and Android asset copy both reference these nonexistent generated files:

- `assets/index-ByXLYY78.js`
- `assets/index-BBavXmQB.css`

An APK built from the current asset directory would not contain a functioning React application.

### Android build

`:app:assembleDebug :app:lintDebug` fails at Java compilation because `ProtectionService` and the manifest reference an absent class:

- `android/app/src/main/java/app/tend/LockActivity.java`

Three compiler errors are produced for `LockActivity.isShowing()`, `LockActivity.class`, and `LockActivity.dismissIfActive()`.

### End-to-end tests

- The configured `tests/**/*.spec.ts` source is absent; only `.DS_Store` remains under `tests/`.
- The local dependency installation is incomplete: Playwright reports a missing `playwright-core/lib/coreBundle.js`.
- `npm ls --depth=0` resolves the declared top-level packages, but installed versions drift above the lockfile ranges and cannot be treated as a reproducible `npm ci` state.
- Historical documentation claims 16 browser tests passed, but their source is not checked in and they cannot be rerun from this repository.

### Documentation and release evidence

- Root `README.md` contains only `# Tend`.
- `android/README.md`, `docs/USER_GUIDE.md`, and `docs/RELEASE_1.1.md` describe different feature boundaries and versions.
- Android documentation says the app does not request accessibility or activity-recognition capabilities, while the manifest and implementation do.
- Current terms/privacy copy says Tend has no accounts, server, or synchronization. That remains accurate for 1.1 but must be versioned and rewritten before optional cloud sync ships.
- Historical release claims cannot be reproduced from the current commit because critical UI, Android, and test files are absent.
- The requested `ARCHITECTURE.md`, `DATABASE.md`, `SYNC_PROTOCOL.md`, `SECURITY.md`, `ANDROID_SETUP.md`, `DESKTOP_SETUP.md`, `DEPLOYMENT.md`, `TESTING.md`, and `RELEASE_CHECKLIST.md` are absent.

## Missing source and recovery evidence

Git history contains no earlier application revision, so `git checkout` cannot recover the missing files. Local recovery evidence exists:

- A local Codex session archive from 12–14 September 2026 contains the original shell writes for `src/App.tsx`, complete additions for the two CSS files, and subsequent diffs applied during Tend 1.1 hardening.
- That archive also records `src/Experience.tsx`, `docs/RELEASE_CHECKLIST.md`, and `docs/TEND_PRODUCT_AND_EVALUATION_GUIDE.md`, which are absent from this commit.
- Historical Playwright output and session context show that `tests/e2e.spec.ts` existed and ran, but the source must be recovered and verified rather than trusting the old result.
- A compiled `LockActivity.class` survives in ignored Android release build intermediates, and signed historical APKs also contain the class. Its Java source is unavailable in Git; recovery requires decompilation/reconstruction followed by direct behavioral tests.
- Screenshots provide visual acceptance references for Today, Focus, Notebook, You, onboarding, and the protection interruption flow.

Recovered files must be treated as untrusted historical inputs: compare them with current contracts, format them, compile them, and rerun all tests before committing.

## Product coverage against the new Tend 2.0 brief

| Capability | Current status |
| --- | --- |
| Guest/offline mode | Partial foundation exists; UI entry is missing |
| Tasks, notes, focus, routine, workouts, reflection | Schema-1 implementations survive; UI shell is missing |
| Habits | Not implemented as a first-class record |
| Career goals and roadmap | Not implemented |
| Projects and milestones | Not implemented |
| Courses, study plans, spaced repetition | Preliminary quiz helpers only; not integrated |
| Job application tracker | Not implemented |
| Email/password auth | Not implemented |
| Google sign-in | Not implemented or configured |
| Device registration/revocation | Not implemented |
| Guest-to-account migration | Not implemented |
| Cloud synchronization | Not implemented |
| Conflict-preserving notes | Not implemented |
| Live session ownership | Not implemented |
| Android distraction controls | Substantial source exists; build blocked by missing activity |
| Android notifications/alarms | Substantial source exists; build blocked |
| Tauri Windows/macOS app | Not implemented |
| PostgreSQL backend/API | Not implemented |
| CI and release artifacts | Not implemented |

## Data compatibility risks

- `AppState.version` and backup schema are fixed at version 1. There is no migration mechanism for a version change.
- Android's SQLite database version is 1 and `onUpgrade` throws instead of migrating.
- Current storage is one aggregate JSON snapshot; Tend 2.0 synchronization requires stable per-record UUIDs, revisions, tombstones, ownership, and durable queued operations.
- Existing task/activity/note IDs must be preserved. A migration must copy data into normalized records transactionally while retaining the schema-1 snapshot until verification succeeds.
- Notebook recovery drafts live separately in localStorage and need explicit migration/reconciliation so unsaved text is not lost.
- Protection configuration and override history live in SharedPreferences and are intentionally separate from the journal backup. They must remain device-local.

## Security and privacy findings

### Positive controls

- Release signing files are ignored and owner-readable only.
- Android backup/device transfer is disabled for app-private data.
- Cleartext traffic is disabled.
- WebView file/content access, mixed content, popups, and remote navigation are restricted.
- Production WebView debugging is disabled by build type.
- Backup size and JSON validity are checked natively, with full schema validation in TypeScript before restore.
- The accessibility flow is opt-in and exempts system, emergency, home, input, and Tend surfaces.

### Gaps to resolve

- `npm audit` reports one high-severity transitive vulnerability in `source-map-js` below 1.2.2; a lockfile-safe dependency update is available.
- The optional four-digit parental PIN is stored as plaintext inside local state and SharedPreferences. It should be replaced with a salted, deliberately slow verifier or removed as a security claim.
- No remote authentication/token design exists. Tokens must not be added to localStorage or the shared JSON snapshot.
- No authorization, rate limiting, audit logging, redaction, data export, or account deletion service exists.
- The current Android app has no Internet permission. Adding sync changes the privacy and threat model and must be an explicit, reviewed release change.
- Existing terms/privacy statements will become false when cloud accounts or sync are enabled unless sync remains opt-in and disclosures are updated before release.

## Duplication and maintainability

- Validation utilities are duplicated between `src/core.ts` and `src/domain/validation.ts`.
- Shared state, persistence, analytics, and backup parsing are concentrated in a 523-line core module.
- Protection behavior is split across a 955-line React panel and several native classes without a versioned bridge contract.
- Widget and quick-task code directly parse the aggregate JSON snapshot, coupling native features to the schema-1 shape.
- Older protocol/mission types describe a separate 21-day proof/strict-mode direction, while the new brief prioritizes career planning and cross-device sync. The new brief should be authoritative unless the owner explicitly asks to merge both product directions.

## Recommended recovery sequence

1. Recover the exact Tend 1.1 UI, style, test, and Android lock sources from local session/build evidence.
2. Reinstall dependencies from `package-lock.json`, update the vulnerable transitive package without an unrelated major upgrade, and make web, unit, E2E, and Android debug checks reproducible.
3. Add a migration safety harness around schema-1 snapshots and capture fixtures from valid legacy backups before changing storage.
4. Document the recovered baseline and only then extract stable shared record contracts and repository interfaces.
5. Introduce the backend and synchronization as an additive, opt-in subsystem; preserve fully offline guest operation.
6. Add Tauri after the shared repository/sync contracts are proven with two simulated devices.

## Audit conclusion

Phase 1 must be repository recovery, not feature expansion. Building authentication, synchronization, or desktop packaging on the present baseline would make failures harder to distinguish and risks replacing the only surviving implementation of Tend's local data behavior. Recovery is feasible from local evidence, but no recovered artifact should be called complete until fresh builds and tests pass from a clean checkout.
