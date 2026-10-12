# Tend checkpoint — 14 September 2026

The owner explicitly changed scope: ship the working app now because usage is nearly exhausted, then finish the full Tend 2.0 app later this week. Do not automatically resume until requested. The existing 03:00 heartbeat `finish-and-test-tend-apk` is PAUSED. No date for later work was chosen.

## Delivered scope

Tend 1.1.0 (Android version code 2) contains the redesigned four-tab experience, guided onboarding, notebook editing/autosave/recovery drafts, focus timer with durable pause intervals, local routine/logs/workouts/reflections, backups, and opt-in native Instagram/YouTube protection. See RELEASE_1.1.md for actual verification and limits. This is an interim release, not the full Tend 2.0 brief.

## Saved expansion work

The full brief is copied to TEND_2_MASTER_BRIEF.md. Read it and TEND_PRODUCT_AND_EVALUATION_GUIDE.md before continuing. `src/protocolTypes.ts`, `src/domain/validation.ts`, and `src/domain/learning.ts` are preliminary, unintegrated Tend 2.0 work. They are not exposed in the shipped UI. No mission engine, proof verifier, native network integration, migration to schema 2, or mission-driven restriction has been shipped. Existing AppState and backups remain schema 1. Do not imply these partial modules are complete or tested.

## Next work

1. Finish remaining 1.1 hardening: device notebook drafts/delete-undo/keyboard/dark mode and native backup protection scope; test allowance expiry live, permission revoke, reboot, full workflow on a physical phone.
2. Implement and test protocol domain and deterministic mission states, then integrate a single next-mission card in Today and mission context in Focus. Important missions cannot use task checkboxes.
3. Add evidence and local verifiers, then GitHub/Strava/Gemini with deliberate upload consent and secure Android credentials. No live service verification has occurred.
4. Add native mission snapshot policy and escalation, learning/quiz UI, daily research questions, recovery, strict change friction, reports, migrations, and full end-to-end release checks.

## Proposed contracts (not implemented)

Domain: emptyProtocolData, parseProtocolData, createProtocol, tickMissions, startMission, finishMission, submitEvidence, applyVerification, createRecovery, getNextMission, protocolReport. Return immutable ProtocolData.

Native: setCredential(provider,secret), credentialStatus(), remoteRequest(id,provider,requestJson) emitting `tend-verification-result` detail JSON string with requestId/provider/ok/status/data/error. Providers github/strava/gemini; HTTPS allowlist, no redirects, bounded responses, no secret getter. Add native file chooser for image evidence. `syncMissionPolicy` snapshot {enabled,blockedPackages,reason,missionIds,missions:[{id,title,scheduledAt,deadline,status,blockedPackages,restrictAt}],remindersEnabled}; native evaluates while JS is closed. `getNativeBackup/restoreNativeBackup` should exclude credentials and expire imported allowances. Coordinate schema before implementation.

## Build and ownership

Workspace: /Users/rudra/Documents/Dev/PARA_SF (not a git repository). npm run build; npm test; npm run test:e2e; bash scripts/android-build.sh --skip-web; bash scripts/android-test.sh. API 34 emulator is available. Android scripts locate the SDK/JDK. Preserve android/release-signing/tend-release.jks and android/signing.properties locally for update compatibility; those private signing files are deliberately excluded from the shareable source archive. Do not generate a replacement key.

App.tsx is legacy and large; new work should be modular. Root owns UI/styles. Previously protection_upgrade owned Android, notebook_upgrade domain, qa core/tests. Those agents stopped on usage limits; inspect disk before delegating or assuming work exists. Do not repeat their aborted work claims as verification.
