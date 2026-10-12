# Tend 1.1.0 — interim release

14 September 2026. The owner requested shipping the current working app and continuing Tend 2.0 later this week. This release is a usable interim build, not certification that the entire master brief is complete.

## Install

Open releases/Tend-1.1.0.apk on Android 8 or newer. Allow installation from the app used to open the file if Android asks. Install as an update over the old Tend APK; preserve your entries by keeping the existing installation. Export a journal backup in You → Preferences & backups first. The package is app.tend, version name 1.1.0, version code 2, signed with the existing Tend release key.

## Included

- Three-step introduction and four destinations: Today, Focus, Notebook, You.
- A clear next task, shorter daily list, routine, reflection, activity and workout logging.
- Focus timer with restart recovery and durable pause intervals. Finishing a focus session saves time; it does not automatically complete the task.
- Paper notebook with titles, editable pages, search, pinning, questions, autosave, local recovery drafts and removal/undo.
- Local data and JSON backup/restore, including compatibility with old notebook entries and timer records. Fonts and web assets are bundled for offline startup.
- Opt-in Android Accessibility shield for Instagram and YouTube during focus or after configured daily usage limits. Permission disclosure precedes system settings. Temporary access requires a reason and ten-second wait, then grants a recorded ten-minute allowance.

## Verification performed

| Check | Result |
| --- | --- |
| Production TypeScript/Vite build | Passed |
| Core unit tests | 32 passed: time segmentation, overlap/day/lunch calculations, paused restart state, validation and backup retention |
| Browser end-to-end tests | 16 passed across phone and desktop: guidance, navigation, pause/restart/save, notebook editing, legacy restore, export/corrupt backup rejection, offline writing/restart, disclosure and unavailable permissions |
| Visual inspection | Phone Today and notebook writing screenshots inspected; representative phone and desktop screenshots saved under artifacts |
| Android release build/lint | Passed |
| APK signing verification | Passed, v2 signature, existing signing identity |
| Android native instrumentation | Passed: SQLite reopen, invalid writes, alarm validation/persistence/restore/cancel, usage contract, notification channel, exact timer notification |
| Native protection tests | Passed: opt-in, package allowlist, bounded focus, budget/permission decisions, deliberate allowance, expiry/reboot/clock rollback guards, pause/resume and native cancellation sync |
| Live protection observation | Native agent exercised YouTube launch and captured shield/reason/countdown screens on API 34 emulator. Full live expiry/permission/reboot matrix is still incomplete |

An offline browser failure discovered during release testing was fixed: same-origin static cache matching now ignores server Vary headers. The entire 16-test browser suite passed after the fix.

## Limits and unfinished work

Protection supports whole Instagram/YouTube apps. Chrome, arbitrary games, website/domain filtering and mission-based unlocking are not included. The owner can revoke Accessibility, force-stop or uninstall Tend. Permission denial must not show protection as active. Usage Access is separately needed for usage budgets; notifications and exact alarms depend on their Android permissions.

The current JSON journal backup does not include Android Accessibility grants, native shield configuration or its temporary allowance history. Reconfigure protection on another phone. Draft cache is local recovery support; save notebook pages before exporting. Physical-device battery/background behavior, all dark-mode/keyboard combinations, live allowance expiration, full reboot and native document-picker journeys remain to be completed.

The 21-day protocol, evidence engine, GitHub/Strava/Gemini, mastery quizzes, daily question integration, strict consequences, escalating mission alarms and transformation reports are not available in this APK. Preliminary types and learning helpers are preserved in source only. No remote API credentials or external proof have been configured or tested.

## Continue later

Read RESUME_TEND_2.md and TEND_2_MASTER_BRIEF.md. Automatic 03:00 resumption is paused at the owner's request to defer work. The source archive excludes signing secrets and generated dependency/build directories; the existing private signing files remain in the local workspace and must be preserved for future updates.
