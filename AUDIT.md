# Tend 1.1.14 Recovery Audit

**Recovery review:** 12–13 October 2026

**Original broken revision:** `9756540` (`main` / `origin/main`)

**Recovery branch:** `rudra/tend-recovery-baseline`

## Executive disposition

The original repository blockers are resolved on the recovery branch: the React shell and styling are restored, schema-1 compatibility is pinned, browser journeys are executable, Android `LockActivity` is reconstructed and tested, generated bundles are verified before packaging, and the vulnerable transitive dependency is updated without a major framework change.

This is a recovered Tend 1.1.14 baseline, not the requested Tend 2.0 platform. Accounts, authentication, cloud synchronization, backend services, conflict resolution, career/project/course/job workspaces, and a Tauri desktop application remain future work. The desktop experience currently runs in a browser.

## Original blocker disposition

| Original finding | Disposition | Fresh evidence |
| --- | --- | --- |
| `src/App.tsx`, `Experience.tsx`, and global styles were missing; web build failed | **Resolved** | Recovered source is classified in `docs/RECOVERY_PROVENANCE.md`; type-check and production build pass. |
| Unit coverage did not pin complete/legacy/active/paused schema-1 state | **Resolved** | Synthetic compatibility fixtures and persistence rejection checks bring the unit suite to 40 passing tests. |
| Browser E2E source was missing and historical pass claims were not reproducible | **Resolved** | Recovered/extended Playwright source runs 20 phone/desktop journeys, including offline restart and data-safety outcomes. |
| Android manifest/service referenced a missing `LockActivity` | **Resolved** | Reconstructed activity compiles and passes API 34 policy, task-gate, lifecycle, settings, deliberate-break, disablement, and dismissal checks. |
| Generated web and Android HTML referenced absent hashed assets | **Resolved** | Recursive verifier rejects missing/traversing references; current web and copied Android bundles each resolve 25 local files. |
| Partial dependency tree and `source-map-js` high advisory invalidated release evidence | **Resolved** | Clean `npm ci` succeeds; lockfile selects `source-map-js` 1.2.2; high-level audit reports zero vulnerabilities. |
| Root documentation was empty and Android permission/capability text contradicted source | **Resolved** | Root README, canonical test guide, release checklist, Android guide, audit, and provenance now share the verified boundary. |
| Physical-device/OEM behavior lacked evidence | **Still blocked for release claims** | API 34 emulator evidence exists; alarm, battery, accessibility, usage, picker, and signed-upgrade checks remain required on intended phones. |
| Tend 2.0 accounts, sync, backend, and Tauri desktop scope was absent | **Explicitly deferred** | Recovery deliberately preserves schema 1 and offline-only behavior; this work requires separate approved specifications and migrations. |

## Verified recovered architecture

### Shared application

- React 19, TypeScript 5.9, and Vite 7.
- Four destinations: Today, Focus, Notebook, and You.
- Aggregate schema-1 `AppState` with tasks, activities, routine blocks, notebook ideas/pages, reflections, workout sets, wake/sleep logs, settings, and focus timer state.
- Browser persistence through IndexedDB with localStorage only when IndexedDB is unavailable.
- Strict JSON backup parsing/validation before replacement of live state.
- Local fonts and service-worker precache; no runtime CDN dependency.

### Android shell

- Java application, minimum SDK 26, target/compile SDK 36, version code 16/name 1.1.14.
- Hardened WebView local origin and bundled assets; no Android Internet permission.
- Atomic SQLite snapshots with a previous snapshot retained.
- Native notifications/alarms, widgets, document-picker backup/restore, optional usage access, activity-recognition signals, and opt-in accessibility protection.
- Accessibility configuration observes window-state package changes only and cannot retrieve window content, perform gestures, or filter keys.
- Protection is owner-enabled, selected-package based, revocable in system settings, and retains Tend/Home/settings exits plus a deliberate local exception path.

### Absent by design in this baseline

- Account/session/token storage, Google sign-in, device registration, cloud sync, operation queues, revisions/tombstones, server APIs, PostgreSQL, deployment, or remote analytics.
- Native Windows/macOS packaging, Tauri/Rust source, desktop SQLite, or installers.
- First-class Tend 2.0 career roadmap, projects/milestones, course planning, spaced repetition UI, habits, or job application tracking.

## Security and privacy disposition

### Verified positive controls

- Release keys, signing properties, APKs, local SDK paths, generated bundles, and test reports are ignored by Git.
- Android app-private backup/transfer is disabled; explicit document export is the user-controlled backup path.
- Cleartext traffic, WebView file/content access, mixed content, popups, and remote navigation are restricted; production WebView debugging is disabled.
- No Android Internet, overlay, device-admin, contacts, camera, microphone, or location permission is declared.
- Backup size/JSON are checked natively and schema validity is checked before restore; invalid input preserves live data.
- Accessibility is opt-in and exempts system, emergency/dialer, settings, launcher/home, input-method, and Tend surfaces.
- Asset validation rejects path traversal and network fetching.

### Remaining risks and release gates

- The optional four-digit parental PIN is local friction stored in local configuration, not a strong credential. Do not market it as tamper-resistant security; hash/strengthen it or remove the security implication in a later change.
- Physical-device reliability is unverified. API 34 emulator success does not establish OEM alarm delivery, battery behavior, usage accuracy, accessibility lifecycle, or signed upgrade behavior.
- Schema 1 has no migration framework. Any normalized or synchronized Tend 2.0 store must preserve existing IDs and keep a recoverable snapshot until migration verification succeeds.
- Adding accounts, networking, or telemetry changes the privacy/threat model and requires new consent, token storage, authorization, deletion/export, redaction, rate-limit, and disclosure reviews.

## Verification policy

The current command matrix is maintained in `docs/TESTING.md`; release gates are in `docs/RELEASE_CHECKLIST.md`. Only fresh command output from the candidate commit counts as a pass. Historical session archives, compiled classes, screenshots, APKs, and reports remain provenance/comparison evidence only.

Generated output and real journal data must never be committed. Test fixtures use synthetic dates, names, tasks, and notebook content.

## Conclusion

Repository recovery is complete when the final documented verification matrix passes and the recovery branch is reviewed. The result is suitable as a trustworthy offline Tend 1.1.14 development baseline. A public Android release still requires the physical-device checklist; Tend 2.0 expansion remains a separate phase.
