package app.tend;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;
import org.json.JSONArray;
import org.json.JSONObject;

/** Device-local, opt-in configuration. Supports customizable package restrictions, post-work cooldown, and log enforcement. */
final class ProtectionStore {
    static final String INSTAGRAM = "com.instagram.android", YOUTUBE = "com.google.android.youtube", SPOTIFY = "com.spotify.music";
    static final long ALLOWANCE_MS = 600_000L, DELIBERATION_MS = 10_000L;

    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("protection", Context.MODE_PRIVATE); }

    static boolean isExempt(Context context, String pkg) {
        if (pkg == null || pkg.trim().isEmpty()) return true;
        if ("app.tend".equals(pkg) || "app.tend.debug".equals(pkg) || "com.android.settings".equals(pkg)) return true;
        if ("com.android.phone".equals(pkg) || "com.google.android.dialer".equals(pkg) || pkg.contains("dialer") || pkg.contains("emergency") || pkg.contains("telecom")) return true;
        if (pkg.startsWith("com.android.systemui") || pkg.startsWith("com.google.android.inputmethod")) return true;
        if (pkg.contains("launcher") || pkg.contains("home") || "com.google.android.apps.nexuslauncher".equals(pkg) || "com.sec.android.app.launcher".equals(pkg)) return true;
        if (context != null) {
            try {
                Intent homeIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
                android.content.pm.ResolveInfo info = context.getPackageManager().resolveActivity(homeIntent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
                if (info != null && info.activityInfo != null && pkg.equals(info.activityInfo.packageName)) {
                    return true;
                }
            } catch (Throwable ignored) { }
        }
        return false;
    }

    static boolean isExempt(String pkg) {
        return isExempt(null, pkg);
    }

    static boolean target(String pkg) {
        if (isExempt(pkg)) return false;
        return pkg.matches("^[a-zA-Z0-9_]+(\\.[a-zA-Z0-9_]+)+$");
    }

    static String name(String pkg) {
        if (INSTAGRAM.equals(pkg)) return "Instagram";
        if (YOUTUBE.equals(pkg)) return "YouTube";
        if (SPOTIFY.equals(pkg)) return "Spotify";
        String[] parts = pkg.split("\\.");
        if (parts.length > 1) {
            String candidate = parts[parts.length - 1];
            if (candidate.length() > 2) return Character.toUpperCase(candidate.charAt(0)) + candidate.substring(1);
        }
        return pkg;
    }

    static String name(Context context, String pkg) {
        if (INSTAGRAM.equals(pkg)) return "Instagram";
        if (YOUTUBE.equals(pkg)) return "YouTube";
        if (SPOTIFY.equals(pkg)) return "Spotify";
        if (context != null && pkg != null) {
            try {
                android.content.pm.PackageManager pm = context.getPackageManager();
                android.content.pm.ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
                CharSequence label = pm.getApplicationLabel(info);
                if (label != null && label.length() > 0) return label.toString();
            } catch (Exception ignored) { }
        }
        return name(pkg);
    }

    static boolean verifyParentalPin(Context context, String pin) {
        String saved = config(context).optString("parentalPin", "").trim();
        if (saved.isEmpty()) return true;
        return saved.equals(pin != null ? pin.trim() : "");
    }

    static boolean accessibility(Context context) {
        AccessibilityManager manager = context.getSystemService(AccessibilityManager.class);
        if (manager == null || !manager.isEnabled()) return false;
        ComponentName expected = new ComponentName(context, ProtectionService.class);
        for (AccessibilityServiceInfo service : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (expected.equals(ComponentName.unflattenFromString(service.getId()))) return true;
        }
        return false;
    }

    static JSONObject config(Context context) {
        try { return new JSONObject(prefs(context).getString("config", "{}")); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    static JSONArray packages(JSONObject config) {
        JSONArray result = config.optJSONArray("packages");
        return result == null ? new JSONArray().put(INSTAGRAM).put(YOUTUBE).put(SPOTIFY) : result;
    }

    static boolean selected(JSONObject config, String pkg) {
        if (!target(pkg)) return false;
        JSONArray selected = packages(config);
        for (int i = 0; i < selected.length(); i++) if (pkg.equals(selected.optString(i))) return true;
        return false;
    }

    static synchronized boolean configure(Context context, JSONObject update) {
        try {
            JSONObject next = config(context);
            if (update.has("enabled")) next.put("enabled", update.getBoolean("enabled"));
            if (update.has("blockUntilTasksDone")) next.put("blockUntilTasksDone", update.getBoolean("blockUntilTasksDone"));
            if (update.has("cooldownMinutes")) next.put("cooldownMinutes", Math.max(0, Math.min(1440, update.getInt("cooldownMinutes"))));
            if (update.has("logDeadline")) {
                String deadline = update.getString("logDeadline");
                if (deadline.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) next.put("logDeadline", deadline);
            }
            if (update.has("earliestLogMinutes")) next.put("earliestLogMinutes", Math.max(0, Math.min(360, update.getInt("earliestLogMinutes"))));
            if (update.has("lockOnMissedLog")) next.put("lockOnMissedLog", update.getBoolean("lockOnMissedLog"));
            if (update.has("alarmSoundOnMissedLog")) next.put("alarmSoundOnMissedLog", update.getBoolean("alarmSoundOnMissedLog"));
            if (update.has("wakeLockEnabled")) next.put("wakeLockEnabled", update.getBoolean("wakeLockEnabled"));
            if (update.has("wakeLockMinutes")) next.put("wakeLockMinutes", Math.max(5, Math.min(240, update.getInt("wakeLockMinutes"))));
            if (update.has("wakeLockMode")) {
                String mode = update.getString("wakeLockMode");
                if ("timer".equals(mode) || "tasks".equals(mode) || "log".equals(mode)) next.put("wakeLockMode", mode);
            }
            if (update.has("wakeLockResleepPolicy")) {
                String policy = update.getString("wakeLockResleepPolicy");
                if ("reset".equals(policy) || "resume".equals(policy)) next.put("wakeLockResleepPolicy", policy);
            }
            if (update.has("scheduledWake")) {
                String wake = update.getString("scheduledWake");
                if (wake.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) next.put("scheduledWake", wake);
            }
            if (update.has("packages")) {
                JSONArray input = update.getJSONArray("packages"), clean = new JSONArray();
                java.util.HashSet<String> seen = new java.util.HashSet<>();
                for (int i = 0; i < input.length(); i++) {
                    String pkg = input.getString(i);
                    if (!target(pkg)) return false;
                    if (!seen.contains(pkg)) { clean.put(pkg); seen.add(pkg); }
                }
                next.put("packages", clean);
            }
            if (update.has("appLimits")) {
                JSONObject limits = update.getJSONObject("appLimits");
                JSONObject cleanLimits = new JSONObject();
                java.util.Iterator<String> keys = limits.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    int val = limits.optInt(key, 30);
                    if (target(key) && val >= 0 && val <= 1440) cleanLimits.put(key, val);
                }
                next.put("appLimits", cleanLimits);
            }
            if (update.has("defaultAppLimit")) {
                next.put("defaultAppLimit", Math.max(1, Math.min(1440, update.getInt("defaultAppLimit"))));
            }
            if (update.has("parentalPin")) {
                String pin = update.getString("parentalPin").trim();
                if (pin.isEmpty() || pin.matches("^\\d{4}$")) next.put("parentalPin", pin);
            }
            if (update.has("focusUntil")) {
                long until = update.getLong("focusUntil"), now = System.currentTimeMillis();
                if (until < 0 || until > now + 86400000L) return false;
                next.put("focusUntil", until > now ? until : 0);
            }
            return prefs(context).edit().putString("config", next.toString()).commit();
        } catch (Exception ignored) { return false; }
    }

    static void syncFocus(Context context, long until) {
        try { configure(context, new JSONObject().put("focusUntil", Math.max(0, until))); }
        catch (Exception ignored) { }
    }

    static void syncSnapshot(Context context, String json) {
        try {
            JSONObject snapshot = new JSONObject(json);
            JSONArray tasks = snapshot.optJSONArray("tasks");
            if (tasks != null) {
                int oldPending = pendingTasks(context, System.currentTimeMillis());
                prefs(context).edit().putString("tasks", tasks.toString()).commit();
                int newPending = pendingTasks(context, System.currentTimeMillis());
                if (oldPending > 0 && newPending == 0) {
                    prefs(context).edit().putLong("tasksCompletedAt", System.currentTimeMillis()).commit();
                } else if (newPending > 0) {
                    prefs(context).edit().putLong("tasksCompletedAt", 0L).commit();
                }
            }
            JSONObject timer = snapshot.optJSONObject("timer");
            long until = timer == null || !timer.isNull("pausedAt") ? 0 : timer.optLong("startedAt") + timer.optLong("durationMinutes") * 60000L + timer.optLong("pausedMs");
            syncFocus(context, until);

            JSONObject settings = snapshot.optJSONObject("settings");
            if (settings != null) {
                JSONObject update = new JSONObject();
                if (settings.has("wakeLockEnabled")) update.put("wakeLockEnabled", settings.optBoolean("wakeLockEnabled"));
                if (settings.has("wakeLockMinutes")) update.put("wakeLockMinutes", settings.optInt("wakeLockMinutes"));
                if (settings.has("wakeLockMode")) update.put("wakeLockMode", settings.optString("wakeLockMode"));
                if (settings.has("wakeLockResleepPolicy")) update.put("wakeLockResleepPolicy", settings.optString("wakeLockResleepPolicy"));
                if (settings.has("wake")) update.put("scheduledWake", settings.optString("wake"));
                if (update.length() > 0) configure(context, update);
            }
        } catch (Exception ignored) { }
    }

    static long cooldownRemainingMs(Context context, long now) {
        JSONObject current = config(context);
        int cooldownMin = current.optInt("cooldownMinutes", 30);
        if (cooldownMin <= 0) return 0;
        long completedAt = prefs(context).getLong("tasksCompletedAt", 0);
        if (completedAt <= 0) return 0;
        long cooldownDuration = cooldownMin * 60_000L;
        long diff = now - completedAt;
        return (diff >= 0 && diff < cooldownDuration) ? (cooldownDuration - diff) : 0;
    }

    static boolean isMandatoryLogPending(Context context) {
        return prefs(context).getBoolean("mandatoryLogPending", false);
    }

    static void setMandatoryLogPending(Context context, boolean pending) {
        prefs(context).edit().putBoolean("mandatoryLogPending", pending).commit();
    }

    static boolean isDailyLogDone(Context context, String date) {
        return date != null && date.equals(prefs(context).getString("dailyLogCompletedDate", ""));
    }

    static boolean completeDailyLog(Context context, String date) {
        return prefs(context).edit()
            .putString("dailyLogCompletedDate", date)
            .putBoolean("mandatoryLogPending", false)
            .commit();
    }

    static synchronized void onScreenOff(Context context, long now) {
        long lastOn = prefs(context).getLong("lastScreenOnMs", 0);
        long session = (lastOn > 0 && now > lastOn) ? (now - lastOn) : 0;
        long morningScreenOn = prefs(context).getLong("morningScreenOnMs", 0);
        prefs(context).edit()
            .putLong("lastScreenOffMs", now)
            .putLong("morningScreenOnMs", morningScreenOn + session)
            .commit();
        WakeConfidenceEngine.getInstance(context).onScreenOff(now);
    }

    static synchronized void onScreenOn(Context context, long now) {
        prefs(context).edit().putLong("lastScreenOnMs", now).commit();
        WakeConfidenceEngine.getInstance(context).onScreenOn(now);
    }

    static synchronized void checkMorningWake(Context context, long now) {
        WakeConfidenceEngine.getInstance(context).evaluateWakeTrigger(now, "check_morning_wake");
    }

    static synchronized void onWakeAlarmFired(Context context) {
        WakeConfidenceEngine.getInstance(context).onWakeAlarmFired(System.currentTimeMillis());
    }

    static synchronized void recordWake(Context context, long now, String today, boolean isEarly) {
        WakeConfidenceEngine.getInstance(context).evaluateWakeTrigger(now, "record_wake");
    }

    static long wakeLockRemainingMs(Context context, long now) {
        return WakeConfidenceEngine.getInstance(context).getRemainingAwakeMs(now);
    }

    static boolean isWakeLockActive(Context context, long now) {
        return WakeConfidenceEngine.getInstance(context).isWakeLockActive(now);
    }

    static int pendingTasks(Context context, long now) {
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date(now));
        int count = 0;
        try {
            JSONArray tasks = new JSONArray(prefs(context).getString("tasks", "[]"));
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject task = tasks.optJSONObject(i);
                if (task == null || task.optBoolean("done", false)) continue;
                String date = task.optString("date");
                if (date.matches("\\d{4}-\\d{2}-\\d{2}") && date.compareTo(today) <= 0) count++;
            }
        } catch (Exception ignored) { }
        return count;
    }

    static JSONArray history(Context context) {
        try { return new JSONArray(prefs(context).getString("overrides", "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static int boot(Context context) { return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }

    static boolean validOverride(JSONObject entry, String pkg, long now, long elapsed, int boot) {
        long created = entry.optLong("createdAt"), until = entry.optLong("until"), started = entry.optLong("createdElapsed", -1);
        long duration = until - created;
        return pkg.equals(entry.optString("packageName")) && entry.optInt("boot", -2) == boot
            && now >= created && now < until && duration > 0
            && started >= 0 && elapsed >= started && elapsed - started < duration;
    }

    static boolean allowed(Context context, String pkg, long now) {
        JSONArray entries = history(context);
        for (int i = entries.length() - 1; i >= 0; i--) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry != null && validOverride(entry, pkg, now, SystemClock.elapsedRealtime(), boot(context))) return true;
        }
        return false;
    }

    static synchronized boolean grantQuickPass(Context context, String pkg, int minutes) {
        long elapsed = SystemClock.elapsedRealtime();
        if (!target(pkg) || minutes <= 0) return false;
        try {
            JSONArray existing = history(context), next = new JSONArray();
            for (int i = Math.max(0, existing.length() - 99); i < existing.length(); i++) next.put(existing.getJSONObject(i));
            long now = System.currentTimeMillis();
            long duration = minutes * 60_000L;
            next.put(new JSONObject().put("packageName", pkg).put("reason", "Quick pass (" + minutes + "m)").put("createdAt", now)
                .put("until", now + duration).put("createdElapsed", elapsed).put("boot", boot(context)));
            return prefs(context).edit().putString("overrides", next.toString()).commit();
        } catch (Exception ignored) { return false; }
    }

    static synchronized boolean allow(Context context, String pkg, String reason, long deliberationStarted) {
        long elapsed = SystemClock.elapsedRealtime();
        if (!target(pkg) || reason == null || reason.trim().length() < 3 || reason.length() > 200
            || deliberationStarted <= 0 || elapsed - deliberationStarted < DELIBERATION_MS) return false;
        try {
            JSONArray existing = history(context), next = new JSONArray();
            for (int i = Math.max(0, existing.length() - 99); i < existing.length(); i++) next.put(existing.getJSONObject(i));
            long now = System.currentTimeMillis();
            next.put(new JSONObject().put("packageName", pkg).put("reason", reason.trim()).put("createdAt", now)
                .put("until", now + ALLOWANCE_MS).put("createdElapsed", elapsed).put("boot", boot(context)));
            return prefs(context).edit().putString("overrides", next.toString()).commit();
        } catch (Exception ignored) { return false; }
    }

    static JSONObject state(Context context) {
        try {
            JSONObject current = config(context);
            JSONArray publicHistory = new JSONArray(), all = history(context);
            for (int i = 0; i < all.length(); i++) {
                JSONObject entry = all.getJSONObject(i);
                publicHistory.put(new JSONObject().put("packageName", entry.optString("packageName"))
                    .put("reason", entry.optString("reason")).put("createdAt", entry.optLong("createdAt"))
                    .put("until", entry.optLong("until")));
            }
            long now = System.currentTimeMillis();
            String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date(now));
            int pending = pendingTasks(context, now);
            long cooldownRemaining = cooldownRemainingMs(context, now);
            boolean inCooldown = current.optBoolean("enabled", false) && current.optBoolean("blockUntilTasksDone", true) && pending == 0 && cooldownRemaining > 0;
            JSONObject appLimits = current.optJSONObject("appLimits");
            if (appLimits == null) appLimits = new JSONObject();
            int defaultAppLimit = current.optInt("defaultAppLimit", 30);
            boolean hasParentalPin = !current.optString("parentalPin", "").trim().isEmpty();
            JSONObject todayUsage = new JSONObject();
            try {
                java.util.Map<String, Long> usageMillis = UsageMonitor.getTodayUsageMillis(context);
                for (java.util.Map.Entry<String, Long> entry : usageMillis.entrySet()) {
                    todayUsage.put(entry.getKey(), Math.floor(entry.getValue() / 6000.0) / 10.0);
                }
            } catch (Exception ignored) { }
            return new JSONObject().put("enabled", current.optBoolean("enabled", false)).put("accessibility", accessibility(context))
                .put("usageAccess", UsageMonitor.hasAccess(context)).put("packages", packages(current))
                .put("blockUntilTasksDone", current.optBoolean("blockUntilTasksDone", true))
                .put("cooldownMinutes", current.optInt("cooldownMinutes", 30))
                .put("cooldownRemainingMs", cooldownRemaining)
                .put("inCooldown", inCooldown)
                .put("logDeadline", current.optString("logDeadline", "20:30"))
                .put("earliestLogMinutes", current.optInt("earliestLogMinutes", 60))
                .put("dailyLogDone", isDailyLogDone(context, today))
                .put("mandatoryLogPending", isMandatoryLogPending(context))
                .put("lockOnMissedLog", current.optBoolean("lockOnMissedLog", true))
                .put("alarmSoundOnMissedLog", current.optBoolean("alarmSoundOnMissedLog", true))
                .put("wakeLockEnabled", current.optBoolean("wakeLockEnabled", false))
                .put("wakeLockMinutes", current.optInt("wakeLockMinutes", 60))
                .put("wakeLockMode", current.optString("wakeLockMode", "timer"))
                .put("wakeLockResleepPolicy", current.optString("wakeLockResleepPolicy", "reset"))
                .put("wakeState", WakeConfidenceEngine.getInstance(context).getWakeState(now))
                .put("wakeAccumulatedAwakeMs", WakeConfidenceEngine.getInstance(context).getAccumulatedAwakeMs(now))
                .put("isWakeLockActive", isWakeLockActive(context, now))
                .put("wakeLockRemainingMs", wakeLockRemainingMs(context, now))
                .put("wakeTimeToday", prefs(context).getLong("wakeTimeToday", 0))
                .put("pendingTasks", pending)
                .put("taskLocked", current.optBoolean("enabled", false) && current.optBoolean("blockUntilTasksDone", true) && pending > 0)
                .put("focusUntil", Math.max(0, current.optLong("focusUntil"))).put("overrides", publicHistory)
                .put("appLimits", appLimits)
                .put("defaultAppLimit", defaultAppLimit)
                .put("hasParentalPin", hasParentalPin)
                .put("todayUsage", todayUsage);
        } catch (Exception ignored) { return new JSONObject(); }
    }

    /** Pure policy used by the service and native regression tests. */
    static String decision(boolean enabled, boolean selected, long focusUntil, boolean allowance, boolean usageAvailable, double usedMinutes, int budget, long now) {
        return decision(enabled, selected, focusUntil, allowance, usageAvailable, usedMinutes, budget, now, 0, false, 0, false);
    }
    static String decision(boolean enabled, boolean selected, long focusUntil, boolean allowance, boolean usageAvailable, double usedMinutes, int budget, long now, int pendingTasks, boolean taskGate) {
        return decision(enabled, selected, focusUntil, allowance, usageAvailable, usedMinutes, budget, now, pendingTasks, taskGate, 0, false);
    }
    static String decision(boolean enabled, boolean selected, long focusUntil, boolean allowance, boolean usageAvailable, double usedMinutes, int budget, long now, int pendingTasks, boolean taskGate, long cooldownRemaining, boolean mandatoryLog) {
        if (mandatoryLog) return "mandatory_log";
        if (!enabled || !selected || allowance) return "";
        if (taskGate && pendingTasks > 0) return "tasks";
        if (taskGate && pendingTasks == 0 && cooldownRemaining > 0) return "cooldown";
        if (focusUntil > now) return "focus";
        if (usageAvailable && budget > 0 && usedMinutes >= budget) return "budget";
        return "";
    }
}
