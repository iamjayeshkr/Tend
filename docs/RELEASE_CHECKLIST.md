# Tend Release Checklist

Use this checklist for a release candidate, not as a historical status page. Record the commit, date, host, device/API, command, exit result, and artifact checksum for every completed gate. Commands are maintained in [TESTING.md](TESTING.md).

## Source and scope

- [ ] Release commit is identified and the working tree is clean.
- [ ] Recovery provenance and any reconstructed source limitations have been reviewed.
- [ ] No placeholder, generated bundle, report, APK, signing file, local SDK path, credential, or real user data is tracked.
- [ ] The release contains only approved scope; unfinished account, sync, backend, Tauri, and Tend 2.0 workspace work is not described as shipped.

## Documentation truth checks

- [ ] No account or cloud-sync capability is claimed for this offline baseline.
- [ ] No Tauri or desktop-native installer is claimed; desktop means the browser experience unless a separately verified package exists.
- [ ] Browser protection is described as guidance only, never as native application interception.
- [ ] Emulator evidence is labeled emulator-only and is not presented as physical-device verification.
- [ ] Historical screenshots, APKs, build output, or reports are not presented as current pass evidence.
- [ ] Privacy/terms copy matches every permission, local data flow, and network capability in the candidate.

## Dependencies and web

- [ ] `npm ci` succeeds from the committed lockfile.
- [ ] Type-check, unit tests, asset-verifier tests, production build, and phone/desktop Playwright journeys pass.
- [ ] `npm audit --audit-level=high` reports no unresolved high or critical advisory, or an exact upstream blocker and acceptance owner are recorded.
- [ ] The production preview is manually checked at 1440×1000 for onboarding and Today, Focus, Notebook, and You.
- [ ] Offline reload works after the service worker has installed.
- [ ] Keyboard-only navigation, visible focus, dialogs, reduced motion, and horizontal overflow are checked.

## Bundle integrity

- [ ] `dist/index.html` resolves every local generated reference.
- [ ] The copied Android asset `index.html` resolves every local generated reference.
- [ ] The service-worker precache list contains only present bundle files.
- [ ] Browser console/network logs contain no missing local asset or uncaught application error.

## Android static and emulator gates

- [ ] Debug APK, debug test APK, and debug lint pass.
- [ ] Release assembly, release lint, shrinking, signing, and signature verification pass when producing a release candidate.
- [ ] SQLite reopen/invalid-write, alarms, exact timer, usage contract, and notification channel instrumentation pass.
- [ ] Protection policy, task gating, activity lifecycle, settings route, deliberate break, owner disablement, and dismissal instrumentation pass.
- [ ] The optional accessibility service observes package changes only; window-content retrieval, gestures, key filtering, overlay, device-admin, and Internet access remain absent.
- [ ] Home, Tend, and Android Accessibility settings remain legitimate exits from the protection screen.

## Privacy and data safety

- [ ] Browser IndexedDB and Android SQLite preserve a schema-1 fixture across restart.
- [ ] Export/import accepts a valid backup and rejects corrupt, oversized, duplicate-ID, out-of-range, and future-schema input without replacing live data.
- [ ] Android protection configuration and exceptions remain local and are not misrepresented as part of the journal backup.
- [ ] No analytics, advertising, remote logging, account token, or undisclosed outbound request is introduced.
- [ ] The plaintext optional parental PIN is not represented as strong security; remediation or explicit risk acceptance is recorded.

## Signing and artifacts

- [ ] The preserved Android signing key and configuration are available from an encrypted backup and are never printed or committed.
- [ ] Version name/code are intentional and upgrade-compatible.
- [ ] APK signature verification passes and the published SHA-256 is generated from the final signed artifact.
- [ ] The installation/upgrade path is tested without uninstalling the previous signed version.

## Physical-device release gates

- [ ] Notification, alarm sound/lockscreen, exact-alarm denial/revocation, reboot/time change, force-stop, and battery-saver behavior pass on intended devices.
- [ ] Usage totals and accessibility protection pass with real installed applications on intended OEMs.
- [ ] Accessibility consent/revocation cannot strand the user; emergency, settings, launcher, input, and Tend surfaces remain exempt.
- [ ] Backup picker, process recreation, and signed in-place update pass on a physical device.
- [ ] Any OEM/device-specific limitation is documented in release notes.

Do not mark the Android release ready while a required physical-device gate is untested.
