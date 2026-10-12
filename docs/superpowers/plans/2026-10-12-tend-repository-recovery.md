# Tend Repository Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Tend 1.1 from surviving source and historical evidence, launch its desktop browser experience for testing first, then re-establish trustworthy browser and Android verification without changing the schema-1 data contract.

**Architecture:** Recover the existing React application shell and visual layer onto the surviving offline-first `AppState` core. Keep browser persistence in IndexedDB (with the existing localStorage fallback) and Android persistence behind `AndroidBridge` and SQLite. Treat historical sources as recovery inputs, pin schema-1 behavior with synthetic fixtures, and rebuild Android protection only against its existing service/store contracts.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Playwright 1.58, Android Java 17/Gradle, IndexedDB, SQLite.

**Spec:** [`docs/superpowers/specs/2026-10-12-tend-repository-recovery-design.md`](../specs/2026-10-12-tend-repository-recovery-design.md)

## Global Constraints

- Preserve Tend's current visual identity and four-destination experience: Today, Focus, Notebook, and You.
- Preserve `AppState.version === 1`; do not introduce accounts, sync, a backend, Tauri, or a schema migration in this plan.
- Treat the local Codex session archive, compiled Android class, APKs, build artifacts, and screenshots as read-only evidence. Do not commit an archive, APK, keystore, credential, or real user journal.
- Classify every restored file as exact historical source, replayed historical source, reconstructed source, or new validation/documentation.
- Use synthetic dates and journal content in tests. Never extract an installed user's database for fixtures.
- Keep Android protection opt-in, revocable, and restricted to the existing allowlisted package policy. Do not add Internet, overlay, device-admin, anti-uninstall, or system-app interception capabilities.
- Run each verification command fresh. A historical report is a comparison artifact, not pass evidence.
- Keep generated `dist/`, Android asset bundles, test output, and APKs untracked.

## Review Focus

1. **Historical replay order:** a missing or misordered `App.tsx` patch could compile while silently restoring an earlier five-tab product. Task 1 pins final exports, four-destination navigation, and screenshot-visible outcomes.
2. **Schema-1 compatibility:** older untitled notes, optional fields, and active or paused timers must not be dropped. Task 2 adds complete synthetic fixtures and rejection tests before UI E2E relies on them.
3. **Generated asset integrity:** stale `index.html` references can make a build or APK appear complete while it cannot launch. Task 5 adds a failing fixture and a bundle-reference verifier.
4. **Protection escape and lifecycle:** activity recreation, permission denial, a too-short reason, or a premature countdown must not produce a bypass or a trap. Task 4 adds contract and instrumentation coverage.
5. **Reproducibility and dependency risk:** the existing partial `node_modules` tree and high-severity `source-map-js` advisory cannot be used as release evidence. Tasks 1 and 5 require a clean install and a minimal lockfile repair.

---

## Task 1: Restore and launch the desktop browser experience

**Files:**

- Create: `src/App.tsx`
- Create: `src/Experience.tsx`
- Create: `src/styles.css`
- Create: `src/experience.css`
- Create: `docs/RECOVERY_PROVENANCE.md`
- Verify: `src/main.tsx`
- Verify: `src/Notebook.tsx`
- Verify: `src/ProtectionPanel.tsx`
- Verify: `src/TermsModal.tsx`
- Test: TypeScript production build and desktop browser smoke check

**Interfaces:**

- Consumes: `defaultState()`, `loadState()`, `persistState(state)`, `makeBackup(state)`, `parseBackup(text)`, timer/day helpers, and `AppState`/`Category` types from `src/core.ts`.
- Consumes: the existing `Notebook`, `ProtectionPanel`, `TermsModal`, and doodle component exports without changing their public props.
- Produces: `export default function App()` for `src/main.tsx`.
- Produces: `Welcome`, `TodayPage`, and `YourSpace` with the recovered historical signatures in `src/Experience.tsx`.
- Produces: a desktop preview at `http://127.0.0.1:4173` from the current committed source.

### Steps

- [ ] Run `git status --short --branch` and confirm only expected plan/document changes are present before source recovery.
- [ ] Run `npm ci` so the lockfile, rather than the incomplete existing installation, supplies dependencies.
- [ ] Run `npm run build` and record the expected red baseline: `src/main.tsx` cannot resolve `./App`.
- [ ] Extract the complete historical `Experience.tsx`, `styles.css`, and `experience.css` contents from the identified 12 September 2026 session archive; record archive path, event timestamp, source class, and content digest in `docs/RECOVERY_PROVENANCE.md`.
- [ ] Reconstruct `src/App.tsx` by combining its two complete initial historical writes and replaying every later recorded `App.tsx` patch in timestamp order; record each replay boundary and resulting digest.
- [ ] Compare the recovered imports and exports against `src/main.tsx`, `src/Notebook.tsx`, `src/ProtectionPanel.tsx`, `src/TermsModal.tsx`, `src/core.ts`, and the final historical `Experience.tsx` signatures.
- [ ] Remove only historical remote font imports that would reintroduce a network dependency; retain the existing local `@fontsource` imports and all recovered design tokens.
- [ ] Run `npm run build` and fix only recovery mismatches until TypeScript and Vite pass without placeholders or weakened checks.
- [ ] Run `npm test` and require the existing unit suite to remain green.
- [ ] Start `npm run preview -- --host 127.0.0.1 --port 4173` and open the desktop viewport at 1440×1000.
- [ ] Verify that onboarding can reach Today, that Today/Focus/Notebook/You navigation is present, and that no missing-module, missing-asset, or console error appears.
- [ ] Compare Today, Focus, Notebook, You, onboarding, and protection disclosure against the saved `artifacts/v1.1-desktop-*.png` references; record discrepancies rather than redesigning them.
- [ ] Stop the preview server after the smoke check unless the user wants it left running.
- [ ] Commit the recovered desktop milestone with message `feat: restore Tend desktop experience`.

**Milestone:** At this point the user can test Tend's recovered desktop browser experience. This is not yet a Tauri installer; desktop-native packaging remains a follow-on phase.

## Task 2: Pin the schema-1 compatibility boundary

**Files:**

- Create: `src/test-fixtures/schema1.ts`
- Modify: `src/core.test.ts`
- Test: `src/core.test.ts`

**Interfaces:**

- Consumes: `AppState`, `ActiveTimer`, and `Idea` from `src/core.ts`.
- Consumes: `parseBackup(text: string): AppState`, `makeBackup(state: AppState): string`, `loadState(): Promise<AppState>`, and `persistState(state: AppState): Promise<void>`.
- Produces: `schema1CompleteState(): AppState`, `schema1LegacyState(): AppState`, `schema1ActiveTimerState(): AppState`, and `schema1PausedTimerState(): AppState` synthetic fixture builders.
- Produces: valid wrapped/raw backup strings and invalid format/version/range variants for unit and browser tests.

### Steps

- [ ] Add failing tests that import the planned schema-1 fixture builders and assert their complete supported field coverage.
- [ ] Run `npx vitest run src/core.test.ts` and confirm the fixture imports fail before implementation.
- [ ] Implement deterministic synthetic fixture builders covering tasks, routine, activities, reviews, workout sets, wake/sleep logs, settings, protection-related settings, a legacy untitled note, a titled note, interval history, and linked tasks/missions.
- [ ] Add tests that raw and wrapped schema-1 fixtures round-trip without field loss through `parseBackup(makeBackup(state))`.
- [ ] Add tests that active and paused timers retain elapsed-time, pause history, linkage, and approximate-timing semantics.
- [ ] Add tests that corrupt JSON, oversized input, unsupported wrapper versions, duplicates, invalid dates/ranges, and unexpected properties cannot replace or pollute a valid live snapshot.
- [ ] Add tests that a rejected native or IndexedDB write does not make a later `loadState()` report an unsaved fixture as durable.
- [ ] Run `npx vitest run src/core.test.ts` and require all new and existing core tests to pass.
- [ ] Run `npm test` and require the complete unit suite to pass.
- [ ] Commit with message `test: pin Tend schema one compatibility`.

## Task 3: Restore the browser journey suite

**Files:**

- Create: `tests/e2e.spec.ts`
- Modify only if required for deterministic startup: `playwright.config.ts`
- Test: `tests/e2e.spec.ts`
- Reference: `artifacts/v1.1-phone-*.png`
- Reference: `artifacts/v1.1-desktop-*.png`

**Interfaces:**

- Consumes: the user-visible React experience through the configured `phone` and `desktop` Playwright projects.
- Consumes: schema-1 fixtures by serializing only synthetic fixture data into Tend's public backup/import or storage boundary.
- Produces: durable-state assertions for onboarding, navigation, task/focus completion, timer restoration, notebook recovery, backup restore, offline restart, and protection disclosure.
- Produces: current failure traces/screenshots under ignored `artifacts/` paths only.

### Steps

- [ ] Recover every exact historical E2E test body available in the session archive and annotate provenance in `docs/RECOVERY_PROVENANCE.md`.
- [ ] Add the desktop acceptance test for the final four-destination navigation before adding any recovery-specific workaround; do not encode the obsolete five-tab shell.
- [ ] Run `npm run test:e2e -- --project=desktop` and confirm any red result is a real recovered-app mismatch rather than a missing browser binary or server failure; if the exact recovered behavior already passes, record it as characterization evidence instead of manufacturing a failure.
- [ ] Add or recover onboarding coverage that starts with no state and reaches a useful Today action without requesting Android-only permissions.
- [ ] Add or recover Today → task → focus → pause → reload → resume → finish coverage, asserting the persisted activity and linked task outcome.
- [ ] Add active-timer and paused-timer reload tests using clock control so they do not depend on wall-clock sleeps.
- [ ] Add notebook create, autosave, navigation-away, edit, restart recovery, delete, and undo coverage for both legacy untitled and titled entries.
- [ ] Add backup export/restore round-trip coverage and corrupt/incompatible restore coverage that proves existing data remains unchanged.
- [ ] Add offline restart coverage after the service worker cache has been established.
- [ ] Add browser protection coverage that confirms an honest unavailable-state message and no claim of native blocking.
- [ ] Add phone and desktop checks for all four destinations, dialogs, keyboard reachability, reduced motion, and horizontal overflow.
- [ ] Run `npm run test:e2e -- --project=desktop` and require the desktop journey suite to pass.
- [ ] Run `npm run test:e2e -- --project=phone` and require the phone journey suite to pass.
- [ ] Run `npm run test:e2e` and require the combined suite to pass.
- [ ] Commit with message `test: restore Tend browser journeys`.

## Task 4: Reconstruct the Android protection activity

**Files:**

- Create: `android/app/src/main/java/app/tend/LockActivity.java`
- Modify: `android/app/src/androidTest/java/app/tend/NativeSmokeTest.java`
- Verify: `android/app/src/main/java/app/tend/ProtectionService.java`
- Verify: `android/app/src/main/java/app/tend/ProtectionStore.java`
- Verify: `android/app/src/main/AndroidManifest.xml`
- Test: Android debug compile, lint, and instrumentation

**Interfaces:**

- Consumes: intent extras `packageName`, `appName`, and `reason` emitted by `ProtectionService`.
- Consumes: `ProtectionStore.allow(...)`, `ProtectionStore.allowed(...)`, and the existing local override/history policy.
- Produces: `public static boolean isShowing()` and `public static void dismissIfActive()` for `ProtectionService`.
- Produces: explicit return-to-Tend, home-screen, temporary-break, and accessibility-settings actions without acquiring new privileges.

### Steps

- [ ] Extend `NativeSmokeTest` with a failing compile-time/activity-contract path that references `LockActivity.isShowing()` and `LockActivity.dismissIfActive()` and exercises lifecycle-safe dismissal.
- [ ] Run `./android/gradlew -p android --no-daemon :app:assembleDebug :app:lintDebug` and confirm the red baseline is the missing `LockActivity` contract.
- [ ] Inspect the surviving release class/API surface, manifest entry, `ProtectionService`, `ProtectionStore`, screenshots, and historical instrumentation; record reconstruction provenance without copying decompiled output verbatim.
- [ ] Implement the minimal activity UI in Java with truthful blocked-app/reason text, Tend and Home exits, and a clear accessibility-settings route.
- [ ] Implement temporary break as a two-stage deliberate action: a non-empty reason followed by the existing ten-second eligibility check before `ProtectionStore.allow(...)` can succeed.
- [ ] Restore countdown and input state across activity recreation without treating recreation as elapsed intent or granting an override.
- [ ] Ensure service dismissal closes the active instance and that leaving a blocked target does not strand the user in the activity.
- [ ] Add instrumentation assertions for too-short wait, empty reason, valid reason, cross-app isolation, expiry, reboot/clock guards, settings reachability, owner disablement, and activity recreation.
- [ ] Run `./android/gradlew -p android --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug` and require compilation and lint to pass.
- [ ] If an API 34 emulator is available, run `scripts/android-test.sh`; record permission-dependent skips separately from failures.
- [ ] Launch the debug app on the emulator and perform the documented task/focus/protection smoke flow when accessibility and usage access can be granted.
- [ ] Commit with message `fix: restore Android protection activity`.

## Task 5: Make builds reproducible and reject broken bundles

**Files:**

- Create: `scripts/verify-assets.mjs`
- Create: `scripts/verify-assets.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/android-build.sh`
- Modify: `scripts/android-test.sh` only if the shared asset gate must run there
- Test: clean install, dependency audit, bundle-reference verifier, web build, Android asset copy

**Interfaces:**

- Consumes: an HTML file plus its bundle root directory.
- Produces: `export async function verifyAssetReferences(htmlPath, rootDir)` that rejects missing same-origin local `script`, stylesheet, icon, manifest, and service-worker build references.
- Produces package scripts: `typecheck`, `test:unit`, and `verify:assets`; retains `test`, `test:e2e`, `build`, and `preview` compatibility.
- Produces: an Android build path that refuses to package stale or incomplete `dist/` output.

### Steps

- [ ] Add `scripts/verify-assets.test.mjs` with a temporary broken HTML fixture that references a missing hashed JavaScript file.
- [ ] Run the verifier test and confirm it fails because `scripts/verify-assets.mjs` does not yet exist.
- [ ] Implement local-reference parsing and file existence checks without fetching network resources or accepting path traversal outside the bundle root.
- [ ] Run the verifier test and require the broken fixture to be rejected and a complete fixture to pass.
- [ ] Add `typecheck`, `test:unit`, and `verify:assets` scripts and wire `verify:assets` after the Vite/service-worker build.
- [ ] Call the same verifier after `dist/` is copied into `android/app/src/main/assets/public` so stale Android assets fail before Gradle packaging.
- [ ] Run `npm audit --json` to capture the current `source-map-js` high-severity path.
- [ ] Apply the smallest compatible direct resolution/override or lockfile refresh that selects `source-map-js >= 1.2.2`; do not force unrelated major upgrades.
- [ ] Remove and recreate dependencies with `npm ci`, then run `npm audit --audit-level=high` and require no high or critical result unless an exact upstream blocker is documented.
- [ ] Run `npm run typecheck`, `npm run test:unit`, `npm run build`, and `npm run verify:assets`.
- [ ] Run the Android web-asset copy/build path and verify both `dist/index.html` and `android/app/src/main/assets/public/index.html` resolve every local generated reference.
- [ ] Commit with message `build: verify Tend dependency and asset integrity`.

## Task 6: Reconcile documentation and collect final evidence

**Files:**

- Modify: `README.md`
- Create: `docs/RELEASE_CHECKLIST.md`
- Create: `docs/TESTING.md`
- Modify: `android/README.md`
- Modify: `docs/RECOVERY_PROVENANCE.md`
- Modify: `AUDIT.md`
- Test: complete verification matrix from a clean checkout state

**Interfaces:**

- Consumes: fresh output from every command below and the provenance classifications from Tasks 1–5.
- Produces: one canonical test guide, one release checklist, and an audit disposition that clearly separates verified, skipped, blocked, and future work.
- Produces: honest capability wording for browser versus Android and offline-only versus planned cloud/desktop-native features.

### Steps

- [ ] Add documentation assertions to the review checklist: no account/sync/Tauri claim, no browser-native protection claim, no physical-device claim based only on emulator output, and no release claim based on historical artifacts.
- [ ] Update `README.md` with current prerequisites, clean setup, desktop browser launch, unit/E2E commands, Android debug commands, and the current offline-only boundary.
- [ ] Write `docs/TESTING.md` as the canonical command/evidence guide and make other documents link to it rather than duplicate drifting instructions.
- [ ] Write `docs/RELEASE_CHECKLIST.md` with source, dependency, browser, asset, Android, privacy, signing, and physical-device gates.
- [ ] Update `android/README.md` so permissions and protection behavior match the manifest and recovered implementation.
- [ ] Complete `docs/RECOVERY_PROVENANCE.md` with file classifications, evidence sources, digests, replay order, and known limitations.
- [ ] Update `AUDIT.md` so each original blocker is marked resolved, still blocked, or explicitly deferred with fresh evidence.
- [ ] Run `git diff --check`.
- [ ] Run `npm ci`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run verify:assets`.
- [ ] Run `npm run test:e2e`.
- [ ] Run `npm audit --audit-level=high`.
- [ ] Run `./android/gradlew -p android --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug`.
- [ ] Run `scripts/android-test.sh` on an available emulator, or record the exact unavailable prerequisite without converting it into a pass.
- [ ] Inspect `git status --short` and confirm no generated bundle, report, APK, keystore, signing property, local SDK path, or real user data is staged.
- [ ] Review the branch diff against the recovery spec, with special attention to the five failure classes in **Review Focus**.
- [ ] Commit with message `docs: record Tend recovery verification`.

## Completion Criteria

- [ ] The committed desktop browser application launches at 1440×1000 with Today, Focus, Notebook, and You intact.
- [ ] Schema-1 state and backups survive complete, legacy, active-timer, and paused-timer tests without data loss.
- [ ] Phone and desktop Playwright journeys pass from the recovered commit.
- [ ] Android debug compilation and lint pass with a tested `LockActivity`; emulator-only and physical-device-only evidence is labeled honestly.
- [ ] Web and Android HTML reference only files present in their respective generated bundles.
- [ ] A clean `npm ci` reproduces unit, build, E2E, asset, and high-severity audit results.
- [ ] Documentation describes the product that actually exists and leaves cloud sync, career workspaces, and Tauri for later approved phases.
