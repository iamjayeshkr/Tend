package app.tend;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Monitors package changes to enforce focus sessions and screen time limits.
 * Inspects package names only; no screen text, keystrokes, gestures, or window content
 * are accessed. Everything is processed strictly on-device.
 */
public final class ProtectionService extends AccessibilityService implements SharedPreferences.OnSharedPreferenceChangeListener {
    private final Handler main = new Handler(Looper.getMainLooper());
    private String foreground = "", shownPackage = "", shownReason = "";
    private final Runnable foregroundCheck = this::evaluate;
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                foreground = "";
                main.removeCallbacks(foregroundCheck);
                dismiss();
                ProtectionStore.onScreenOff(context, System.currentTimeMillis());
            } else if (Intent.ACTION_USER_PRESENT.equals(action) || Intent.ACTION_SCREEN_ON.equals(action)) {
                ProtectionStore.onScreenOn(context, System.currentTimeMillis());
                evaluate();
            }
        }
    };

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        StateStore stored = new StateStore(this);
        try { String snapshot = stored.load(); if (snapshot != null) ProtectionStore.syncSnapshot(this, snapshot); }
        catch (Exception ignored) { }
        finally { stored.close(); }
        ProtectionStore.prefs(this).registerOnSharedPreferenceChangeListener(this);
        getSharedPreferences("native", MODE_PRIVATE).registerOnSharedPreferenceChangeListener(this);
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(screenReceiver, filter);
        WakeConfidenceEngine.getInstance(this).requestSleepUpdates();
        WakeConfidenceEngine.getInstance(this).armSensors();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();

        long now = System.currentTimeMillis();
        WakeConfidenceEngine.getInstance(this).onUserInteraction(now);

        // If event is from Tend itself (MainActivity or LockActivity), ignore
        if (pkg.equals(getPackageName())) return;
        String inputMethod = Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        if (inputMethod != null && inputMethod.startsWith(pkg + "/")) return;

        // If user is on launcher, settings, or exempt app, NEVER block!
        if (ProtectionStore.isExempt(this, pkg)) {
            foreground = "";
            dismiss();
            return;
        }

        ProtectionStore.checkMorningWake(this, now);
        boolean mandatoryPending = ProtectionStore.isMandatoryLogPending(this);
        boolean wakeLockActive = ProtectionStore.isWakeLockActive(this, now);
        JSONObject config = ProtectionStore.config(this);

        if (mandatoryPending) {
            foreground = pkg;
        } else if (wakeLockActive) {
            foreground = (ProtectionStore.target(pkg) && ProtectionStore.selected(config, pkg)) ? pkg : "";
        } else {
            foreground = (ProtectionStore.target(pkg) && ProtectionStore.selected(config, pkg)) ? pkg : "";
        }
        evaluate();
    }

    @Override public void onSharedPreferenceChanged(SharedPreferences preferences, String key) {
        if ("config".equals(key) || "overrides".equals(key) || "limits".equals(key) || "tasks".equals(key) || "mandatoryLogPending".equals(key) || "tasksCompletedAt".equals(key) || "dailyLogCompletedDate".equals(key) || "wakeLockDate".equals(key) || "wakeLockUntil".equals(key) || "wakeState".equals(key) || "wakeAccumulatedAwakeMs".equals(key)) main.post(this::evaluate);
    }

    private void evaluate() {
        main.removeCallbacks(foregroundCheck);
        PowerManager power = getSystemService(PowerManager.class);
        if (power == null || !power.isInteractive()) { dismiss(); return; }

        if (foreground.isEmpty() || ProtectionStore.isExempt(this, foreground)) {
            dismiss();
            return;
        }

        JSONObject config = ProtectionStore.config(this);
        boolean enabled = config.optBoolean("enabled", false);
        if (!enabled) { dismiss(); return; }

        boolean mandatoryPending = ProtectionStore.isMandatoryLogPending(this);
        if (mandatoryPending) {
            show(foreground, "mandatory_log", 0, 0, 0);
            main.postDelayed(foregroundCheck, 2000);
            return;
        }

        long now = System.currentTimeMillis();
        boolean wakeLockActive = ProtectionStore.isWakeLockActive(this, now);
        if (wakeLockActive) {
            if (!ProtectionStore.selected(config, foreground)) {
                dismiss();
                return;
            }
            long remainingMs = ProtectionStore.wakeLockRemainingMs(this, now);
            show(foreground, "morning_lock", 0, 0, remainingMs / 60000.0);
            main.postDelayed(foregroundCheck, 2000);
            return;
        }

        boolean selected = ProtectionStore.selected(config, foreground);
        if (!selected) { dismiss(); return; }
        boolean allowed = ProtectionStore.allowed(this, foreground, now);
        if (allowed) { dismiss(); return; }
        long focusUntil = config.optLong("focusUntil", 0);
        int pending = ProtectionStore.pendingTasks(this, now);
        boolean taskGate = config.optBoolean("blockUntilTasksDone", true);
        long cooldownRemaining = ProtectionStore.cooldownRemainingMs(this, now);
        double minutes = 0; boolean usageAvailable = false;
        int defaultBudget = config.optInt("defaultAppLimit", 30);
        int budget = defaultBudget;
        JSONObject appLimits = config.optJSONObject("appLimits");
        if (appLimits != null && appLimits.has(foreground)) {
            budget = appLimits.optInt(foreground, defaultBudget);
        } else {
            try {
                JSONObject limits = new JSONObject(getSharedPreferences("native", MODE_PRIVATE).getString("limits", "{}"));
                String key = ProtectionStore.INSTAGRAM.equals(foreground) ? "instagram" : ProtectionStore.YOUTUBE.equals(foreground) ? "youtube" : "spotify";
                if (limits.has(key)) budget = limits.optInt(key, defaultBudget);
            } catch (Exception ignored) { }
        }
        if (!allowed && focusUntil <= now && !(taskGate && (pending > 0 || cooldownRemaining > 0))) {
            usageAvailable = UsageMonitor.hasAccess(this);
            if (usageAvailable) {
                minutes = UsageMonitor.getUsageMinutesToday(this, foreground);
            }
        }
        String reason = ProtectionStore.decision(enabled, selected, focusUntil, allowed, usageAvailable, minutes, budget, now, pending, taskGate, cooldownRemaining, false);
        if (reason.isEmpty()) dismiss(); else show(foreground, reason, focusUntil, budget, minutes);
        long delay = focusUntil > now ? Math.max(1000, Math.min(15000, focusUntil - now)) : (cooldownRemaining > 0 ? Math.min(5000, cooldownRemaining) : 15000);
        main.postDelayed(foregroundCheck, delay);
    }

    private void show(String pkg, String reason, long focusUntil, int budget, double minutes) {
        if (pkg.equals(shownPackage) && reason.equals(shownReason) && LockActivity.isShowing()) return;
        shownPackage = pkg; shownReason = reason;
        Intent intent = new Intent(this, LockActivity.class);
        intent.putExtra("package", pkg);
        intent.putExtra("reason", reason);
        intent.putExtra("focusUntil", focusUntil);
        intent.putExtra("budget", budget);
        intent.putExtra("minutes", minutes);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { startActivity(intent); }
        catch (Exception ignored) { }
    }

    private void dismiss() {
        LockActivity.dismissIfActive();
        shownPackage = ""; shownReason = "";
    }

    @Override public void onInterrupt() { foreground = ""; main.removeCallbacks(foregroundCheck); dismiss(); }
    @Override public boolean onUnbind(Intent intent) { onInterrupt(); return super.onUnbind(intent); }
    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null); dismiss();
        ProtectionStore.prefs(this).unregisterOnSharedPreferenceChangeListener(this);
        getSharedPreferences("native", MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(this);
        try { unregisterReceiver(screenReceiver); } catch (IllegalArgumentException ignored) { }
        super.onDestroy();
    }
}
