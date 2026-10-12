# Tend

Tend is your personal study, routine, and attention notebook. Plan a day, see what comes next, record what actually happens, and finish with a short reflection. It needs no account.

## Install on Android

1. Copy the supplied APK to your phone and open it.
2. If Android asks, allow that file manager or browser to install this APK. Follow the installation screen.
3. Open Tend. Your schedule and history live on this device.

Keep the release signing key with the project if you build future updates. An update must use the same application ID and signing key to replace the installed app while retaining its data.

## Shape your day

Set a name and adjust routine blocks for your own wake time, school or work, lunch, exercise, study, and bedtime. The current and next blocks follow the device's local time. Logging an activity records what happened; your planned schedule remains your plan.

Start with one useful action: log waking up, start a focused study session, or capture the next thing to do. You can add detail gradually.

## Record what happens

- **Focus:** Choose study, work, or project work, enter an objective, and start. Pause when interrupted and finish with an outcome or a note. Reopening the app restores an active timer.
- **Fitness:** Record a run's manual distance and duration, skipping repetitions, core time, or gym exercises with weight, repetitions, and sets. This version does not measure GPS distance.
- **Office:** Record arrival/departure and work sessions. Work before and after the lunch boundary can be reviewed separately.
- **Ideas and tasks:** Capture a thought as soon as it appears, or add a concrete task you can complete.
- **Sleep:** Log going to sleep and waking up. Overnight duration is an estimate based on those entries.
- **Review:** Record what went well, what took your attention, and what matters tomorrow. Weekly views summarize the history you have actually saved.

Rest, breaks, walking, and thinking are valid intentional activities. Tend should help you notice your time, not turn every minute into work.

## Android reminders and attention limits

Enable each Android capability when you want to use it. Declining a permission leaves the rest of the notebook usable.

**Notifications:** Allow notifications to receive alarms and usage warnings. Android's notification settings also control sound and visibility.

**Alarms:** Create an alarm and enable exact-alarm access when precise timing matters. Alarm delivery uses Android notifications with an alarm sound. Device settings, Do Not Disturb, manufacturer battery management, force-stop, and a powered-off device can affect delivery. Verify your wake alarm on your own phone before relying on it.

**Usage Access:** Grant Tend Usage Access in Android settings to read foreground time for supported apps such as Instagram and YouTube. Your usage data stays on your phone. Configure an allowance to receive a limit warning.

Usage checks run periodically in the background and also refresh in the app. Android may delay background jobs. Warnings are reminders; this release does not block another app, show blocking overlays, or promise interruption at the exact second a budget ends.

The web app cannot read other apps' usage or schedule native Android alarms. It identifies these features as Android capabilities.

## Keep a backup

Export a complete backup regularly, especially before uninstalling Tend, changing phones, or clearing app storage. Save the file somewhere you can recover independently of the phone. The backup contains personal history in readable form, so choose its location with care.

To restore, select the backup, review its preview, and confirm restoration. Restoration replaces the current notebook. Invalid or incompatible files must be rejected before your existing history changes.

The Android document picker lets you choose a save or restore location. In a browser, export uses the normal download flow and restore selects a local file.

## Offline use

The APK includes the app and fonts, so core use needs no internet connection. For the web app, open it once online and allow the offline cache to finish before disconnecting. Web history belongs to that browser and site; clearing site data removes it.

There is no automatic cloud backup or cross-device sync. Export is the way to move or safeguard your notebook.

## First-release boundaries

This release targets the PRD's MVP. GPS routes, Android widgets, overlay blocking, strict mode, device-owner controls, advanced correlations, and automatic cloud sync are outside this release. Consult `RELEASE_CHECKLIST.md` for actual test evidence and remaining verification work.
