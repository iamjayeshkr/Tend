# Tend Repository Recovery Design

**Date:** 12 October 2026

**Status:** Proposed for implementation

**Scope:** Tend 2.0 Phase 1 — repository recovery and reproducible baseline

**Audit:** [`AUDIT.md`](../../../AUDIT.md)

## Intent

Restore the existing Tend 1.1 application to a reproducible, testable baseline without replacing its product identity, silently changing its schema-1 data, or claiming that historical artifacts prove the current source works.

This is the first subproject of the broader Tend 2.0 effort. It deliberately excludes accounts, cloud synchronization, the backend, Tauri, and new career workspaces. Those systems will be designed after the recovered local product and its compatibility boundary are proven.

The newly supplied career-accountability Tend 2.0 brief is authoritative. The older in-repository 21-day protocol/proof direction remains preserved as unintegrated source, but it will not drive the recovery architecture or be surfaced as a finished feature.

## Success criteria

The recovery phase is successful when:

1. The committed React application launches with Tend's existing Today, Focus, Notebook, and You experience.
2. The current schema-1 journal loads, saves, exports, restores, and survives restart without migration or data loss.
3. The Android debug application compiles and launches with the recovered local web bundle.
4. Opt-in protection has a buildable, testable `LockActivity` implementation with a legitimate exit and system-settings path.
5. Unit, browser, and Android checks run from documented commands after a clean dependency install.
6. Generated HTML references only files present in the generated bundle and Android assets.
7. Historical test claims are replaced by fresh evidence from the recovered commit.
8. Documentation states the actual product boundary and does not describe unavailable cloud or desktop features as shipped.

## Non-goals

- No account creation, password storage, Google sign-in, or token handling.
- No server, PostgreSQL, ORM, REST API, OpenAPI document, or deployment.
- No cloud synchronization, operation queue, tombstones, or conflict resolution.
- No Tauri shell, desktop installer, or desktop-native commands.
- No schema-2 state, normalized local tables, or destructive migration.
- No redesign of the existing visual identity.
- No expansion of Android blocking beyond supported, disclosed accessibility behavior.
- No release-version bump until the baseline passes all applicable checks.

## Recovery approaches considered

### 1. Evidence-led source recovery — selected

Reconstruct missing sources from the local Codex session archive, surviving compiled class, signed APKs, build artifacts, screenshots, and current interfaces. Replay historical changes in order, then validate the result as if it were new code.

This approach maximizes fidelity to the existing product and preserves the current data contract. It requires careful provenance tracking and does not assume decompiled or historical source is correct.

### 2. Minimal replacement application shell — rejected

Create a small new `App.tsx` that exposes only the surviving core functions and components. This would make compilation faster but would silently remove working Tend workflows, invalidate visual references, and violate the requirement not to replace the original application with a generic substitute.

### 3. Immediate Tend 2.0 rewrite — rejected

Start the monorepo, backend, and desktop app while leaving the 1.1 client broken. This would obscure whether later failures come from recovery or new architecture and would provide no trustworthy migration source for existing user data.

## Source provenance policy

Every recovered file will be classified in the implementation record:

- **Exact historical source:** complete content exists in a local session archive or surviving source copy.
- **Replayed historical source:** an initial complete source plus an ordered sequence of recorded patches produces the file.
- **Reconstructed source:** only compiled or behavioral evidence exists; the source is recreated to match explicit contracts and is covered by new tests.
- **New test/documentation:** newly authored material that validates or explains recovered behavior.

Product source must not be inferred from screenshots alone. Screenshots are visual acceptance references, not executable specifications. If a critical workflow cannot be recovered or proven, it remains documented as unavailable rather than being represented as restored.

No private user journal, Android database, signing secret, or credential will be copied into Git. Session archives are read-only recovery inputs and will not be committed.

## Components

### 1. React application shell

Recover:

- `src/App.tsx`
- `src/styles.css`
- `src/experience.css`
- `src/Experience.tsx` if the recovered final `App.tsx` imports it

`App.tsx` will be produced by extracting its two recorded initial writes and replaying the subsequent recorded patches in timestamp order. The result must compile against the surviving `core`, notebook, protection, terms, and doodle modules.

The recovered shell owns navigation, modal coordination, daily workflow, timers, activities, reflection, backup UI, and native-bridge coordination. The recovery phase may split no behavior out of this shell unless a minimal extraction is required to make a behavior directly testable. Broad refactoring waits until the baseline is green.

### 2. Visual system

Recover the full historical style sheets from the session archive and compare their rendered output with the saved phone and desktop screenshots. Bundled font packages remain the runtime source; remote font imports in historical CSS must not reintroduce a network dependency.

Visual acceptance focuses on:

- Warm paper background and restrained forest-green, peach, lavender, and sage accents.
- Fraunces headings, DM Sans body copy, and restrained Caveat annotations.
- Four primary destinations on mobile and matching desktop sidebar navigation.
- Responsive Today, Focus, Notebook, You, onboarding, and protection disclosure screens.
- Keyboard focus visibility, touch target size, reduced motion, overflow, and readable contrast.

### 3. Android protection activity

Recover `android/app/src/main/java/app/tend/LockActivity.java` as reconstructed source. The surviving release class and signed APK define structure and observable behavior; `ProtectionService`, `ProtectionStore`, the manifest, screenshots, and historical instrumentation define its interfaces.

The activity must:

- Expose `isShowing()` and `dismissIfActive()` for `ProtectionService`.
- Render the blocked application name and truthful reason received from the service.
- Provide a return-to-Tend action and a home-screen action.
- Allow a deliberate temporary break only after a nontrivial reason and the configured ten-second wait.
- Provide a clear path to Android accessibility settings so the owner can disable protection.
- Dismiss when the protection service determines the target is no longer blocked.
- Avoid overlay permissions, device-admin behavior, anti-uninstall behavior, or interception of essential/system applications.
- Restore safely across activity recreation without granting an unintended bypass.

The implementation must not be copied blindly from decompiled output. Names and control flow may be clarified, but externally observable behavior and bridge contracts must be pinned by tests.

### 4. Browser end-to-end suite

Recover `tests/e2e.spec.ts` where exact source is available. When a historical test body cannot be recovered exactly, author a new test from the recorded acceptance behavior and label it as new validation rather than original source.

The suite must cover at least:

- Onboarding into a useful first action without requesting special permissions.
- Today → task → focus → pause/resume → finish → persisted activity.
- Timer restoration after reload while active and paused.
- Notebook create, autosave, navigation, edit, restart recovery, delete, and undo.
- Legacy schema-1 restore and full export/restore round trip.
- Corrupt or incompatible backup rejection without replacing existing data.
- Offline restart after the service worker cache is established.
- Protection disclosure and honest browser-unavailable state.
- Phone and desktop navigation, dialog reachability, and overflow.

Tests will assert durable state and observable outcomes, not only button presence.

### 5. Dependency baseline

Use `package-lock.json` as the installation source and verify with `npm ci`. Repair the missing Playwright installation through the clean install rather than adding undeclared packages.

Resolve the high-severity `source-map-js` advisory with the smallest compatible lockfile update. Do not use `npm audit fix --force`, upgrade unrelated major versions, or weaken checks to obtain a green audit.

The package scripts will expose distinct type-check, unit-test, E2E, and build commands if needed for CI in a later phase. This phase does not introduce a complete release pipeline.

### 6. Compatibility fixtures

Add synthetic, non-personal schema-1 fixtures representing:

- Empty first-run state.
- Tasks, routine, activities, reviews, workout sets, wake/sleep logs, and settings.
- A legacy untitled notebook entry.
- A titled notebook entry with metadata.
- Active and paused timers with interval history.
- Protection-related settings stored in the shared snapshot.
- Valid backup wrapper and deliberately invalid variants.

Fixtures prove the current parser and persistence contract before any future schema migration. The recovery phase does not extract a user's installed database or commit live data.

### 7. Documentation baseline

Update or restore:

- `README.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/TESTING.md` or root `TESTING.md`, choosing one canonical location
- Existing Android documentation where it contradicts the manifest

Documentation will distinguish:

- Source present versus feature verified.
- Browser capability versus Android-native capability.
- Emulator evidence versus physical-device evidence.
- Debug builds versus signed release builds.
- Current offline-only operation versus planned opt-in cloud synchronization.

## Data flow

### Browser

```text
React action
  → immutable AppState update
  → validate schema-1 snapshot
  → serialize write behind prior writes
  → IndexedDB transaction
  → report committed state to UI
```

localStorage remains a fallback only when IndexedDB is unavailable. Notebook recovery drafts remain separate and must be reconciled before navigation discards an unsaved draft.

### Android

```text
React action
  → validate schema-1 snapshot
  → AndroidBridge.saveState(JSON)
  → SQLite transaction: current snapshot → previous snapshot
  → commit new current snapshot
  → synchronize device-local task/timer protection view
  → update widgets
  → return success to React
```

If the initial native read fails, native writes remain locked for that process so an empty UI cannot overwrite existing data. This behavior is preserved and tested.

### Backup

```text
Current validated AppState
  → versioned JSON wrapper
  → document picker or browser download

Selected JSON
  → size/JSON check
  → TypeScript schema validation
  → preview/confirmation
  → durable write
```

Invalid input never replaces the live snapshot.

## Error handling

- Recovery extraction fails closed if a complete historical source or required patch cannot be identified.
- Web build errors remain visible; no placeholder module is added to suppress them.
- A dependency install failure is reported with the package and command; lockfile integrity is not bypassed.
- Storage failures surface a persistent UI error and do not claim that a change was saved.
- Backup parse, size, version, range, and duplicate failures preserve current data.
- Android permission denial leaves the rest of Tend usable and never displays protection as active.
- Android asset validation fails the build if HTML references a missing local file.
- Instrumentation prerequisites such as emulator state, notification access, or exact-alarm access are reported explicitly.
- Physical-device-only behaviors remain unverified until tested on a real device.

## Security boundaries

- Do not commit `android/signing.properties`, keystores, APKs, local SDK paths, `.env` files, tokens, or user data.
- Do not print signing passwords or credential contents in logs.
- Do not add Android Internet permission during recovery.
- Keep WebView navigation local and content security policy restrictive.
- Accessibility remains opt-in, disclosed, and revocable through Android settings.
- Replace or clearly de-scope the plaintext parental PIN before presenting it as a security control. Recovery tests may preserve compatibility but must not strengthen the claim.
- Keep native protection preferences and override history device-local and outside synchronized backup data.

## Testing strategy

### Static and unit gates

- Clean install with `npm ci`.
- TypeScript type-check.
- Existing unit suite, plus recovered compatibility fixture tests.
- `npm audit` with no high or critical advisory left unresolved unless an exact upstream blocker is documented.
- Android debug compilation and lint.
- Generated asset reference validation.

### Browser gates

- Production Vite build.
- Playwright suite on Pixel 7 and 1440×1000 desktop projects.
- Offline reload with cached assets.
- Saved screenshots for Today, Focus, Notebook, You, onboarding, and protection disclosure.
- Keyboard-only navigation and reduced-motion checks for primary flows.

### Android gates

- Debug APK assembly and lint.
- Instrumentation for SQLite reopen, invalid writes, alarms, timer delivery, usage contract, protection configuration, allowance timing, and activity dismissal.
- Launch on the available API 34 emulator and execute the task/focus/protection smoke flow.
- Verify that the APK asset index references present JavaScript and CSS.
- Release assembly and signature verification only after debug checks pass and only with the preserved signing configuration.

### Evidence rules

Fresh command output is required for every pass claim. Historical screenshots and reports are comparisons, not pass evidence. A failed or skipped check remains listed with its exact blocker.

## Implementation boundaries

The recovery work will be delivered in small commits:

1. Recover the React shell and visual source; restore the web build.
2. Recover/recreate browser tests and compatibility fixtures; restore E2E execution.
3. Reconstruct and test `LockActivity`; restore Android compilation and lint.
4. Repair dependency security and add asset-integrity checks.
5. Reconcile documentation with verified behavior and record fresh release evidence.

Each commit must preserve the previous green checks. Generated files remain ignored. No commit combines recovery with new Tend 2.0 product functionality.

## Follow-on architecture

After recovery, Tend 2.0 proceeds through separate specifications and implementation plans:

1. Shared record contracts and schema-1-to-record migration.
2. Local repository adapters and durable operation queue.
3. Authentication, devices, PostgreSQL API, and incremental sync.
4. Conflict-preserving notes and two-device convergence tests.
5. Android account/sync integration with device-local protection boundaries.
6. Tauri desktop shell and desktop SQLite adapter.
7. Career roadmap, projects, courses, habits, and job-switch workspaces.
8. CI, signing-aware release jobs, security review, and platform validation.

Each follow-on phase must keep guest mode fully offline and preserve the recovered local data until its migration is independently verified.
