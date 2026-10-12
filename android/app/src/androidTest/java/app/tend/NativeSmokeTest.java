package app.tend;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;
import org.json.JSONObject;

/** Runs on an isolated debug application; never touches a signed release installation. */
public final class NativeSmokeTest extends Instrumentation {
    private String mode;
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments); mode = arguments == null ? "" : arguments.getString("mode", ""); start();
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        Context context = getTargetContext();
        try {
            if (!context.getPackageName().endsWith(".debug")) throw new IllegalStateException("Test requires isolated debug package");
            if (mode.startsWith("protection-")) { protection(context, result); finish(Activity.RESULT_OK, result); return; }
            if ("prepare-boot".equals(mode)) {
                if (!AlarmScheduler.saveDaily(context,"boot-smoke","08:15","Reboot restoration check")) throw new AssertionError("alarm not saved");
                AlarmScheduler.timer(context,System.currentTimeMillis() + 600000,"Reboot timer check");
                result.putString("stream","PASS: daily alarm and timer prepared for reboot.\n");
                finish(Activity.RESULT_OK,result); return;
            }
            if ("verify-boot".equals(mode)) {
                android.content.Intent alarmIntent = new android.content.Intent(context,AlarmReceiver.class).setAction("app.tend.ALARM")
                    .setData(android.net.Uri.parse("tend://alarm/boot-smoke"));
                android.content.Intent timerIntent = new android.content.Intent(context,AlarmReceiver.class).setAction("app.tend.ALARM")
                    .setData(android.net.Uri.parse("tend://timer/focus"));
                int flags = android.app.PendingIntent.FLAG_NO_CREATE | android.app.PendingIntent.FLAG_IMMUTABLE;
                if (android.app.PendingIntent.getBroadcast(context,0,alarmIntent,flags) == null) throw new AssertionError("boot did not recreate daily alarm intent");
                if (android.app.PendingIntent.getBroadcast(context,0,timerIntent,flags) == null) throw new AssertionError("boot did not recreate timer intent");
                JSONObject bootAlarms = new JSONObject(context.getSharedPreferences("native",Context.MODE_PRIVATE).getString("alarms","{}"));
                if (!bootAlarms.has("boot-smoke")) throw new AssertionError("boot lost daily alarm definition");
                AlarmScheduler.cancel(context,"boot-smoke"); AlarmScheduler.cancelTimer(context);
                result.putString("stream","PASS: real emulator reboot preserved schedules and BootReceiver recreated daily alarm and timer pending intents.\n");
                finish(Activity.RESULT_OK,result); return;
            }
            context.deleteDatabase("tend.db");
            StateStore first = new StateStore(context);
            if (first.load() != null) throw new AssertionError("new database must be empty");
            String snapshot = "{\"version\":1,\"name\":\"Native persistence check\",\"events\":[{\"id\":\"test\"}]}";
            if (!first.save(snapshot)) throw new AssertionError("save failed");
            first.close();
            StateStore reopened = new StateStore(context);
            if (!snapshot.equals(reopened.load())) throw new AssertionError("state did not survive database close/reopen");
            if (reopened.save("corrupt backup")) throw new AssertionError("invalid JSON accepted");
            if (!snapshot.equals(reopened.load())) throw new AssertionError("invalid write changed saved data");
            reopened.close();
            context.deleteDatabase("tend.db");
            if (AlarmScheduler.saveDaily(context,"smoke","25:90","invalid")) throw new AssertionError("invalid alarm accepted");
            if (!AlarmScheduler.saveDaily(context,"smoke","08:15","Native smoke check")) throw new AssertionError("valid alarm rejected");
            AlarmScheduler.restore(context);
            JSONObject saved = new JSONObject(context.getSharedPreferences("native",Context.MODE_PRIVATE).getString("alarms","{}"));
            if (!saved.has("smoke")) throw new AssertionError("alarm not persisted");
            AlarmScheduler.cancel(context,"smoke");
            JSONObject cleared = new JSONObject(context.getSharedPreferences("native",Context.MODE_PRIVATE).getString("alarms","{}"));
            if (cleared.has("smoke")) throw new AssertionError("alarm cancellation not persisted");
            JSONObject usage = UsageMonitor.today(context);
            if (!usage.has("granted") || !usage.has("apps")) throw new AssertionError("usage API contract failed");
            Notifications.createChannels(context);
            if (context.getSystemService(NotificationManager.class).getNotificationChannel(Notifications.ALARMS) == null) throw new AssertionError("alarm channel missing");
            AlarmScheduler.timer(context,System.currentTimeMillis() + 3000,"Native timer verification");
            Thread.sleep(6500);
            long timerEnd = context.getSharedPreferences("native",Context.MODE_PRIVATE).getLong("timerEnd",0);
            if (AlarmScheduler.hasExactAccess(context) && timerEnd != 0) throw new AssertionError("exact timer receiver did not fire");
            if (Notifications.allowed(context) && AlarmScheduler.hasExactAccess(context)) {
                boolean posted = false;
                for (android.service.notification.StatusBarNotification notification : context.getSystemService(NotificationManager.class).getActiveNotifications()) {
                    if ("focus-finished".equals(notification.getTag())) posted = true;
                }
                if (!posted) throw new AssertionError("timer notification not posted");
            }
            AlarmScheduler.cancelTimer(context);
            context.getSystemService(NotificationManager.class).cancelAll();
            String timerResult = Notifications.allowed(context) && AlarmScheduler.hasExactAccess(context)
                ? "exact timer and notification verified" : "fallback scheduling verified; exact delivery skipped (access not granted)";
            result.putString("stream","PASS: SQLite reopen, invalid-write protection, alarm validation/persistence/restore/cancel, usage contract, notification channel; " + timerResult + ".\n");
            finish(Activity.RESULT_OK,result);
        } catch (Throwable failure) {
            result.putString("stream","FAIL: " + failure + "\n"); finish(Activity.RESULT_CANCELED,result);
        }
    }

    private void protection(Context context, Bundle result) throws Exception {
        long now = System.currentTimeMillis();
        if ("protection-tasks".equals(mode)) {
            ProtectionStore.prefs(context).edit().clear().commit();
            ProtectionStore.configure(context, new JSONObject().put("enabled", true));
            String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date(now));
            String tomorrow = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date(now + 86400000L));
            org.json.JSONArray tasks = new org.json.JSONArray()
                .put(new JSONObject().put("id", "past").put("date", "2020-01-01").put("done", false))
                .put(new JSONObject().put("id", "today").put("date", today).put("done", false))
                .put(new JSONObject().put("id", "future").put("date", tomorrow).put("done", false));
            JSONObject snapshot = new JSONObject().put("tasks", tasks).put("timer", JSONObject.NULL);
            ProtectionStore.syncSnapshot(context, snapshot.toString());
            if (ProtectionStore.state(context).optInt("pendingTasks") != 2) throw new AssertionError("Unfinished today and overdue tasks must lock without a timer; future tasks must wait");
            if (!ProtectionStore.state(context).optBoolean("taskLocked")) throw new AssertionError("Task lock missing");
            tasks.getJSONObject(0).put("done", true);
            ProtectionStore.syncSnapshot(context, snapshot.toString());
            if (!ProtectionStore.state(context).optBoolean("taskLocked")) throw new AssertionError("Completing only one task unlocked apps");
            tasks.getJSONObject(1).put("done", true);
            ProtectionStore.syncSnapshot(context, snapshot.toString());
            if (ProtectionStore.state(context).optBoolean("taskLocked")) throw new AssertionError("Last task did not unlock apps");
            tasks.getJSONObject(1).put("done", false);
            ProtectionStore.syncSnapshot(context, snapshot.toString());
            if (!ProtectionStore.state(context).optBoolean("taskLocked")) throw new AssertionError("Reopened task did not relock");
            ProtectionStore.syncFocus(context, 0);
            if (!ProtectionStore.state(context).optBoolean("taskLocked")) throw new AssertionError("Ending focus bypassed tasks");
            ProtectionStore.configure(context, new JSONObject().put("blockUntilTasksDone", false));
            if (ProtectionStore.state(context).optBoolean("taskLocked")) throw new AssertionError("Owner control ignored");
            if (!"tasks".equals(ProtectionStore.decision(true, true, 0, false, false, 0, 30, now, 1, true))) throw new AssertionError("Service policy does not block tasks without Usage Access");
            if (!"".equals(ProtectionStore.decision(true, true, 0, false, false, 0, 30, now, 0, true))) throw new AssertionError("Service policy failed to unlock");
            if (!"".equals(ProtectionStore.decision(true, false, 0, false, false, 0, 30, now, 1, true))) throw new AssertionError("Unselected app blocked");
            if (!"".equals(ProtectionStore.decision(true, true, 0, true, false, 0, 30, now, 1, true))) throw new AssertionError("Emergency allowance ignored");
            if (!"budget".equals(ProtectionStore.decision(true, true, 0, false, true, 31, 30, now, 0, true))) throw new AssertionError("Completing tasks bypassed daily budget");
            ProtectionStore.prefs(context).edit().clear().commit();
            result.putString("stream", "PASS: task lock persists without timer; overdue/today/future, partial completion, last completion, reopen, focus cancellation and owner control verified.\n"); return;
        }
        if ("protection-prepare".equals(mode)) {
            ProtectionStore.prefs(context).edit().clear().commit();
            if (!ProtectionStore.configure(context, new JSONObject().put("enabled", true).put("focusUntil", now + 600000))) throw new AssertionError("protection not configured");
            result.putString("stream", "PASS: isolated debug protection enabled for real YouTube/Instagram test; focus 10 minutes.\n"); return;
        }
        if ("protection-stop".equals(mode)) {
            ProtectionStore.syncFocus(context, 0);
            result.putString("stream", "PASS: focus stopped; budget protection may remain if configured.\n"); return;
        }
        if ("protection-disable".equals(mode)) {
            ProtectionStore.configure(context, new JSONObject().put("enabled", false));
            result.putString("stream", "PASS: debug protection disabled.\n"); return;
        }
        if ("protection-budget".equals(mode)) {
            ProtectionStore.prefs(context).edit().clear().commit();
            ProtectionStore.configure(context, new JSONObject().put("enabled", true).put("focusUntil", 0));
            context.getSharedPreferences("native", Context.MODE_PRIVATE).edit().putString("limits", "{\"enabled\":false,\"youtube\":1,\"instagram\":1}").commit();
            result.putString("stream", "PASS: isolated one-minute daily budgets configured, no focus timer.\n"); return;
        }
        if ("protection-state".equals(mode)) {
            result.putString("stream", "PASS: " + ProtectionStore.state(context) + " usage=" + UsageMonitor.today(context) + "\n"); return;
        }
        ProtectionStore.prefs(context).edit().clear().commit();
        if (ProtectionStore.config(context).optBoolean("enabled", false)) throw new AssertionError("protection must be opt-in");
        if (!ProtectionStore.configure(context, new JSONObject().put("enabled", true).put("focusUntil", now + 60000))) throw new AssertionError("valid configuration rejected");
        if (ProtectionStore.configure(context, new JSONObject().put("packages", new org.json.JSONArray().put("com.android.settings")))) throw new AssertionError("system package accepted");
        if (ProtectionStore.configure(context, new JSONObject().put("focusUntil", now + 90000000))) throw new AssertionError("unbounded focus accepted");
        if (!ProtectionStore.selected(ProtectionStore.config(context), ProtectionStore.YOUTUBE)) throw new AssertionError("invalid config overwrote defaults");
        if (!ProtectionStore.selected(ProtectionStore.config(context), ProtectionStore.SPOTIFY)) throw new AssertionError("Spotify missing from default packages");
        if (ProtectionStore.selected(ProtectionStore.config(context), "com.android.settings")) throw new AssertionError("settings selectable");
        assertDecision("focus", true, true, now + 1, false, false, 0, now);
        assertDecision("", true, true, now, false, false, 0, now);
        assertDecision("", false, true, now + 1, false, true, 31, now);
        assertDecision("", true, false, now + 1, false, true, 31, now);
        assertDecision("", true, true, now + 1, true, true, 31, now);
        assertDecision("budget", true, true, 0, false, true, 30, now);
        assertDecision("", true, true, 0, false, true, 29.9, now);
        assertDecision("", true, true, 0, false, false, 90, now);
        if (!"cooldown".equals(ProtectionStore.decision(true, true, 0, false, false, 0, 30, now, 0, true, 1800000L, false))) throw new AssertionError("cooldown decision not returned");
        if (!"mandatory_log".equals(ProtectionStore.decision(true, true, 0, false, false, 0, 30, now, 0, false, 0, true))) throw new AssertionError("mandatory log decision not returned");
        long elapsed = android.os.SystemClock.elapsedRealtime();
        JSONObject entry = new JSONObject().put("packageName", ProtectionStore.YOUTUBE).put("createdAt", now).put("until", now + ProtectionStore.ALLOWANCE_MS).put("createdElapsed", elapsed).put("boot", 8);
        if (!ProtectionStore.validOverride(entry, ProtectionStore.YOUTUBE, now + 1000, elapsed + 1000, 8)) throw new AssertionError("valid override rejected");
        if (ProtectionStore.validOverride(entry, ProtectionStore.INSTAGRAM, now + 1000, elapsed + 1000, 8)) throw new AssertionError("override crossed apps");
        if (ProtectionStore.validOverride(entry, ProtectionStore.YOUTUBE, now + ProtectionStore.ALLOWANCE_MS, elapsed + ProtectionStore.ALLOWANCE_MS, 8)) throw new AssertionError("expired override accepted");
        if (ProtectionStore.validOverride(entry, ProtectionStore.YOUTUBE, now - 1000, elapsed + 1000, 8)) throw new AssertionError("wall-clock rollback accepted");
        if (ProtectionStore.validOverride(entry, ProtectionStore.YOUTUBE, now + 1000, elapsed + 1000, 9)) throw new AssertionError("override survived reboot");
        if (ProtectionStore.validOverride(entry, ProtectionStore.YOUTUBE, now + 1000, elapsed + ProtectionStore.ALLOWANCE_MS, 8)) throw new AssertionError("elapsed expiry ignored");
        if (ProtectionStore.allow(context, ProtectionStore.YOUTUBE, "Study clip", elapsed)) throw new AssertionError("ten-second pause bypassed");
        if (ProtectionStore.allow(context, ProtectionStore.YOUTUBE, "", elapsed - 11000)) throw new AssertionError("empty reason accepted");
        if (!ProtectionStore.allow(context, ProtectionStore.YOUTUBE, "Study clip", elapsed - 11000)) throw new AssertionError("deliberate exception rejected");
        if (!ProtectionStore.allowed(context, ProtectionStore.YOUTUBE, System.currentTimeMillis())) throw new AssertionError("exception not persisted");
        if (!"Study clip".equals(ProtectionStore.history(context).getJSONObject(0).getString("reason"))) throw new AssertionError("override reason not stored");
        ProtectionStore.syncSnapshot(context, "{\"timer\":{\"startedAt\":" + now + ",\"durationMinutes\":25,\"pausedAt\":null,\"pausedMs\":1000}}");
        if (ProtectionStore.config(context).optLong("focusUntil") != now + 1501000) throw new AssertionError("timer snapshot did not sync");
        ProtectionStore.syncSnapshot(context, "{\"timer\":{\"pausedAt\":" + now + "}}");
        if (ProtectionStore.config(context).optLong("focusUntil") != 0) throw new AssertionError("paused timer still blocks");
        AlarmScheduler.timer(context, now + 60000, "Protection test");
        if (ProtectionStore.config(context).optLong("focusUntil") != now + 60000) throw new AssertionError("native schedule does not protect");
        AlarmScheduler.cancelTimer(context);
        if (ProtectionStore.config(context).optLong("focusUntil") != 0) throw new AssertionError("cancel did not unblock");
        ProtectionStore.prefs(context).edit().clear().commit();
        result.putString("stream", "PASS: protection opt-in, allowlist, bounded time, focus/budget/permission policy, deliberate local exceptions, expiry/reboot/clock rollback guards, snapshot pause/resume and native cancel synchronization.\n");
    }
    private static void assertDecision(String expected, boolean enabled, boolean selected, long focusUntil, boolean allowance, boolean usage, double used, long now) {
        String actual = ProtectionStore.decision(enabled, selected, focusUntil, allowance, usage, used, 30, now);
        if (!expected.equals(actual)) throw new AssertionError("protection policy: expected " + expected + " got " + actual);
    }
}
