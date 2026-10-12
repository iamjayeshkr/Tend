# Tend Recovery Provenance

**Recovery branch:** `rudra/tend-recovery-baseline`

**Recovery date:** 12 October 2026

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

### Browser journey suite

| File | Classification | Historical evidence | Recovered SHA-256 |
| --- | --- | --- | --- |
| `tests/e2e.spec.ts` | Replayed historical source, followed by new validation | Complete replacement from session event `exec-d040487f-5b9e-4c08-b730-50f32157e08a` at 2026-09-13 11:21:51 UTC, followed by recorded `FileChange` patches at 11:23:08, 21:33:23, and 21:33:38 UTC | `d2bd1df70cb4751ca5970d6268bf132a2cbc5c0546cb97129f95d7fa24155f19` before new recovery tests |

The recovered suite already covered first use, the four final destinations, the task/focus journey, notebook persistence, legacy notes, backup behavior, offline restart, browser protection disclosure, and a mocked Android consent flow. Its screenshot destinations were redirected from the tracked historical reference images to Playwright's ignored per-test output directory so fresh validation cannot overwrite recovery evidence.

New tests marked in source comments cover reversible notebook deletion, future-schema rejection without data loss, and keyboard/reduced-motion dialog access. Existing recovered assertions were updated only where the final recovered product copy or behavior superseded an earlier test expectation. The completed suite has SHA-256 `d7e4393effe725c926102b1b35fc957088d8268ba6df8352dde3888c8bd0a7f9`.

Android `LockActivity` and asset-integrity tooling will be appended here when their owning tasks are implemented. Those entries will identify exact historical material separately from reconstructed or newly authored validation.
