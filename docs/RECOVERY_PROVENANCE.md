# Tend Recovery Provenance

**Recovery branch:** `rudra/tend-recovery-baseline`

**Recovery dates:** 12–13 October 2026

This record distinguishes recovered product source from newly authored validation. Historical evidence is read-only and is not itself proof that the recovered commit works; current build and test results provide that proof.

## Historical source archive

The React source below was recovered from the local Codex session archive:

`/Users/rudra/.codex/sessions/2026/09/12/rollout-2026-09-12T23-41-18-01a096d1-0f35-7362-8feb-ecd99daa655d.jsonl`

The archive is not committed. It was parsed locally, and recovered content was added to this repository through reviewed patches.

## React recovery

| File | Classification | Historical evidence | Recovered SHA-256 |
| --- | --- | --- | --- |
| `src/App.tsx` | Replayed historical source | Full-file replacement emitted by command event `exec-6d2fbee4-4d45-453b-bb8c-3d6309ac0943` at 2026-09-13 11:20:31 UTC, followed by recorded `FileChange` patches at 16:33:56, 16:34:48, 21:34:44, and 2026-09-14 02:41:59 UTC | `7c8746615ce65df9771d39c06334d07242e2b19cbd647991e61cf2ba80b01ee3` |
| `src/Experience.tsx` | Exact historical source | Complete `FileChange` content from event `exec-ba748ab8-3cb1-42d1-9d69-d0234e948705` at 2026-09-13 11:16:42 UTC | `ff82c8657fb78b57738c666ab82ace2f9e829c3b0561b3baad134032bc2d8d28` |
| `src/styles.css` | Replayed historical source | Complete `FileChange` content from event `exec-7a79157a-f69f-41ed-9861-f9773319d86b` at 2026-09-13 10:25:11 UTC, followed by the recorded removal of its remote Google Fonts import at 16:33:56 UTC | `d723d49bb7b3a7cb7aafbd855e014c478bf35037ff0e5dd52718da19f226ac08` |
| `src/experience.css` | Exact historical source | Complete `FileChange` content from event `exec-da84dabc-4859-4884-85d5-d65b238c2662` at 2026-09-13 11:26:12 UTC | `46316b67e04735873ff451e6a72d69a370ee18c351ac6555ec12a3e9ee159835` |

### Replay order

`src/App.tsx` was reconstructed in this order:

1. Parse the complete old/new full-file patch recorded at 11:20:31 UTC and select its new-file side.
2. Apply the 16:33:56 UTC import correction for the named `ProtectionPanel` export.
3. Apply the 16:34:48 UTC timer interval, task-link, and activity-duration corrections.
4. Apply the 21:34:44 UTC calendar-aware category-duration corrections.
5. Apply the 02:41:59 UTC timer cleanup and manual-activity interval corrections.

Every hunk was matched against its recorded context. A missing context would have stopped recovery rather than producing a guessed file.

## Interface checks

- `src/App.tsx` exports `App` as the default export consumed by `src/main.tsx`.
- `src/Experience.tsx` exports `Welcome`, `TodayPage`, and `YourSpace` with their recorded prop signatures.
- The recovered shell imports the surviving default `Notebook` export and named `ProtectionPanel` export.
- `src/main.tsx` remains the only stylesheet entry point and continues to load local `@fontsource` packages before `styles.css` and `experience.css`.
- No recovered stylesheet contains a remote font or other HTTP import.

## Later recovery entries

### Schema-1 validation

| File | Classification | Purpose | SHA-256 |
| --- | --- | --- | --- |
| `src/test-fixtures/schema1.ts` | New synthetic validation fixture | Complete, legacy-optional, active-timer, and paused-timer states with no extracted user content | `b0c02fa86ad534f8ed616d48594e60c66ebd63d2ff05b24c572ce5e6b6c7ad04` |
| `src/core.test.ts` | Existing tests extended with new validation | Pins all schema-1 fixtures, future-schema rejection, durable snapshot retention, and invalid-write behavior | `218ae6d18a27887993700ad6901b670626e94634c6f1389ebbc29d3b7a213898` |

No installed journal or private backup was read to create these fixtures. Names, dates, tasks, activities, and notebook text are synthetic.

### Browser journey suite

| File | Classification | Historical evidence | Recovered SHA-256 |
| --- | --- | --- | --- |
| `tests/e2e.spec.ts` | Replayed historical source, followed by new validation | Complete replacement from session event `exec-d040487f-5b9e-4c08-b730-50f32157e08a` at 2026-09-13 11:21:51 UTC, followed by recorded `FileChange` patches at 11:23:08, 21:33:23, and 21:33:38 UTC | `d2bd1df70cb4751ca5970d6268bf132a2cbc5c0546cb97129f95d7fa24155f19` before new recovery tests |

The recovered suite already covered first use, the four final destinations, the task/focus journey, notebook persistence, legacy notes, backup behavior, offline restart, browser protection disclosure, and a mocked Android consent flow. Its screenshot destinations were redirected from the tracked historical reference images to Playwright's ignored per-test output directory so fresh validation cannot overwrite recovery evidence.

New tests marked in source comments cover reversible notebook deletion, future-schema rejection without data loss, and keyboard/reduced-motion dialog access. Existing recovered assertions were updated only where the final recovered product copy or behavior superseded an earlier test expectation. The completed suite has SHA-256 `d7e4393effe725c926102b1b35fc957088d8268ba6df8352dde3888c8bd0a7f9`.

### Android protection activity

| File | Classification | Recovery evidence | Recovered SHA-256 |
| --- | --- | --- | --- |
| `android/app/src/main/java/app/tend/LockActivity.java` | Reconstructed source | Public class surface and constant-pool strings from the surviving compiled release class (SHA-256 `74b0f8657d3c3a110cbf8cfc21e8e4cb6ded495b1af71793eb71d60a608f4458`), manifest registration, `ProtectionService`/`ProtectionStore` contracts, and the four saved `artifacts/android/protection-*.png` screens | `240e6d32c205b4e4c495cc77785bfa3d7c7538479b3cabd30761cc4d929402ae` |
| `android/app/src/androidTest/java/app/tend/NativeSmokeTest.java` | Existing test runner extended with new validation | The pre-existing policy assertions remain intact; the new `protection-activity` mode validates the reconstructed lifecycle contract | `b3fbc3ce118a1da24a9efa53030c992116c9cb0b4be4b02f262efbed24ad5d3f` |

No historical Java source for `LockActivity` was recovered. The implementation was written from the observable contract rather than copied from bytecode. It accepts the surviving service's `package` extra and the specification's `packageName`/`appName` aliases, renders all current service reasons, provides Tend, Home, and Android Accessibility exits, and preserves the temporary-break reason and monotonic countdown across recreation.

Fresh API 34 evidence covered debug assembly/lint, native persistence and exact-timer delivery, the protection policy matrix, activity launch/recreation/dismissal, and a live Accessibility-service interception of the installed YouTube app. This is emulator evidence, not a physical-device claim.

### Asset integrity and dependency repair

| File | Classification | Purpose | SHA-256 |
| --- | --- | --- | --- |
| `scripts/verify-assets.mjs` | New validation | Fails closed on missing or bundle-escaping local HTML, stylesheet/font, manifest/icon, and service-worker cache references without making network requests | `2b637ba67d980d3968fd99a6c239966925028ad25716fa353036144d7bdf5912` |
| `scripts/verify-assets.test.mjs` | New validation | Covers a missing hashed script, a complete recursive bundle, and path traversal outside the bundle root | `d211f78057638f628d40a7b90e8b42a355e99afbb310b95da62f853d019b7a3f` |

The verifier runs after the web service worker is generated and again on both sides of the Android asset copy. A fresh clean install and audit replaced the vulnerable transitive `source-map-js` 1.2.1 lock entry with 1.2.2; no Vite major version or unrelated dependency was forced. The resulting web and Android bundles each resolved 25 local files during the recovery check.

## Recovery commits

1. `74cf42e` — recovered desktop browser source and provenance.
2. `0cd8376` — pinned schema-1 compatibility.
3. `162b871` — recovered and extended browser journeys.
4. `55f804a` — reconstructed and tested Android protection activity.
5. `4bb9d51` — added bundle integrity checks and repaired the dependency lock.

Planning commits `cb3b42b` and `e50d59d` define the approved recovery-only scope. Final documentation and verification are recorded separately so historical recovery inputs are not confused with current pass evidence.

## Known limitations and evidence boundary

- `src/App.tsx` is a deterministic replay of archived full-file and patch events, not a byte-for-byte file recovered from Git.
- `LockActivity.java` is reconstructed from its observable contract, compiled class surface, adjacent source, and reference screenshots; no historical Java source was found.
- Browser tests combine replayed historical source with clearly identified new recovery validation. Their current successful execution, not the historical report, is the pass evidence.
- API 34 emulator checks cover Android compilation, storage, timers, policy, lifecycle, and a live selected-application interception. They do not establish physical-device or OEM behavior.
- Generated bundles, copied Android assets, reports, APKs, local SDK properties, and signing material remain ignored and are not recovery source.
- This baseline intentionally has no accounts, cloud sync, backend, remote analytics, or Tauri desktop application. Browser “app shield” copy cannot provide native application interception.

The current verification commands and status rules are maintained in `docs/TESTING.md`; release assertions must satisfy `docs/RELEASE_CHECKLIST.md`.
