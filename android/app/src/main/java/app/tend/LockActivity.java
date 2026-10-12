package app.tend;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.lang.ref.WeakReference;
import java.util.Locale;
import org.json.JSONObject;

/**
 * Full-screen, device-local explanation shown while the accessibility service
 * determines that a selected application is unavailable.
 */
public final class LockActivity extends Activity {
    private static final int PAPER = Color.rgb(247, 245, 238);
    private static final int FOREST = Color.rgb(36, 77, 56);
    private static final int MUTED = Color.rgb(91, 111, 94);
    private static final int ACCENT = Color.rgb(108, 145, 78);
    private static final int BORDER = Color.rgb(196, 210, 187);
    private static WeakReference<LockActivity> activeInstance = new WeakReference<>(null);

    private final Handler main = new Handler(Looper.getMainLooper());
    private String targetPackage = "";
    private String reason = "";
    private String appDisplayName = "App";
    private long focusUntil;
    private int budget;
    private double minutes;
    private boolean quickPassExpanded;
    private String quickPassDraft = "";
    private long deliberationStarted;
    private EditText quickPassInput;
    private Button quickPassAction;

    public static boolean isShowing() {
        LockActivity activity = activeInstance.get();
        return activity != null && !activity.isFinishing()
            && (Build.VERSION.SDK_INT < 17 || !activity.isDestroyed());
    }

    public static void dismissIfActive() {
        LockActivity activity = activeInstance.get();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (!activity.isFinishing()
                && (Build.VERSION.SDK_INT < 17 || !activity.isDestroyed())) activity.finish();
        });
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().setStatusBarColor(PAPER);
        getWindow().setNavigationBarColor(PAPER);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        readIntent(getIntent());
        if (savedInstanceState != null) restoreUiState(savedInstanceState);
        if (!isStillLocked()) {
            finish();
            return;
        }
        activeInstance = new WeakReference<>(this);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goHome);
        }
        render();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String previousPackage = targetPackage;
        String previousReason = reason;
        setIntent(intent);
        readIntent(intent);
        if (!previousPackage.equals(targetPackage) || !previousReason.equals(reason)) {
            quickPassExpanded = false;
            quickPassDraft = "";
            deliberationStarted = 0;
        }
        if (!isStillLocked()) {
            finish();
            return;
        }
        render();
    }

    private void readIntent(Intent intent) {
        if (intent == null) return;
        String packageName = intent.getStringExtra("packageName");
        if (packageName == null || packageName.trim().isEmpty()) packageName = intent.getStringExtra("package");
        targetPackage = packageName == null ? "" : packageName.trim();
        String suppliedName = intent.getStringExtra("appName");
        appDisplayName = suppliedName == null || suppliedName.trim().isEmpty()
            ? ProtectionStore.name(this, targetPackage) : suppliedName.trim();
        String suppliedReason = intent.getStringExtra("reason");
        reason = suppliedReason == null ? "" : suppliedReason.trim();
        focusUntil = intent.getLongExtra("focusUntil", 0);
        budget = intent.getIntExtra("budget", 0);
        minutes = intent.getDoubleExtra("minutes", 0);
    }

    private void restoreUiState(Bundle state) {
        quickPassExpanded = state.getBoolean("quickPassExpanded", false);
        quickPassDraft = state.getString("quickPassDraft", "");
        deliberationStarted = state.getLong("deliberationStarted", 0);
        long elapsed = SystemClock.elapsedRealtime();
        if (deliberationStarted < 0 || deliberationStarted > elapsed) deliberationStarted = 0;
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (quickPassInput != null) quickPassDraft = quickPassInput.getText().toString();
        outState.putBoolean("quickPassExpanded", quickPassExpanded);
        outState.putString("quickPassDraft", quickPassDraft);
        outState.putLong("deliberationStarted", deliberationStarted);
    }

    private boolean isStillLocked() {
        if (targetPackage.isEmpty() || ProtectionStore.isExempt(this, targetPackage)) return false;
        long now = System.currentTimeMillis();
        if (ProtectionStore.allowed(this, targetPackage, now)) return false;
        JSONObject config = ProtectionStore.config(this);
        if (!config.optBoolean("enabled", false)) return false;
        if ("mandatory_log".equals(reason)) return ProtectionStore.isMandatoryLogPending(this);
        if ("morning_lock".equals(reason)) return ProtectionStore.isWakeLockActive(this, now);
        if (!ProtectionStore.selected(config, targetPackage)) return false;
        if ("tasks".equals(reason)) {
            return config.optBoolean("blockUntilTasksDone", true)
                && ProtectionStore.pendingTasks(this, now) > 0;
        }
        if ("cooldown".equals(reason)) return ProtectionStore.cooldownRemainingMs(this, now) > 0;
        if ("focus".equals(reason)) return config.optLong("focusUntil", focusUntil) > now;
        if ("budget".equals(reason)) {
            if (!UsageMonitor.hasAccess(this)) return false;
            int currentBudget = budget > 0 ? budget : config.optInt("defaultAppLimit", 30);
            JSONObject limits = config.optJSONObject("appLimits");
            if (limits != null && limits.has(targetPackage)) {
                currentBudget = limits.optInt(targetPackage, currentBudget);
            }
            return currentBudget > 0
                && UsageMonitor.getUsageMinutesToday(this, targetPackage) >= currentBudget;
        }
        return true;
    }

    private void render() {
        main.removeCallbacksAndMessages(null);
        quickPassInput = null;
        quickPassAction = null;
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PAPER);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        content.setPadding(dp(24), dp(32), dp(24), dp(32));
        scroll.addView(content, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        content.addView(text(headerLabel(), 16, MUTED, false));
        TextView mark = text(reasonMark(), 50, ACCENT, false);
        mark.setPadding(0, dp(24), 0, dp(18));
        content.addView(mark);
        TextView heading = text(heading(), 38, FOREST, true);
        heading.setTypeface(Typeface.create("serif", Typeface.BOLD));
        content.addView(heading);
        TextView explanation = text(explanation(), 20, MUTED, false);
        explanation.setPadding(0, dp(8), 0, dp(12));
        content.addView(explanation);

        Button tend = button(returnLabel(), true);
        tend.setOnClickListener(view -> openTend());
        content.addView(tend);
        Button home = button("Go to my home screen", false);
        home.setOnClickListener(view -> goHome());
        content.addView(home);

        if (canRequestTemporaryBreak()) {
            if (quickPassExpanded) addQuickPassControls(content);
            else {
                Button request = button("I need this app for a moment", false);
                request.setOnClickListener(view -> {
                    quickPassExpanded = true;
                    render();
                });
                content.addView(request);
            }
        }

        Button settings = button(settingsLabel(), false);
        settings.setContentDescription("Open Android accessibility settings");
        settings.setOnClickListener(view -> openAccessibilitySettings());
        content.addView(settings);
        TextView footer = text(
            "A boundary you choose. You can change it any time in Android Accessibility settings.",
            15, MUTED, false);
        footer.setPadding(0, dp(10), 0, 0);
        content.addView(footer);
        setContentView(scroll);
        applyWindowInsets(content);
        if (quickPassExpanded && deliberationStarted > 0) updateCountdown();
    }

    private String headerLabel() {
        if ("mandatory_log".equals(reason)) return "tend  /  daily commitment";
        if ("morning_lock".equals(reason)) return "tend  /  morning focus";
        return "tend  /  a little space to choose";
    }

    private String reasonMark() {
        if ("mandatory_log".equals(reason)) return "🔒";
        if ("morning_lock".equals(reason)) return "☀";
        if ("cooldown".equals(reason)) return "⌛";
        return "✳";
    }

    private String heading() {
        if ("mandatory_log".equals(reason)) return "Log your entry\nto unlock.";
        if ("morning_lock".equals(reason)) return "Rise and shine.\nYour morning is protected.";
        if ("cooldown".equals(reason)) return "Rest before\nthe scroll.";
        return "Your attention\nis worth keeping.";
    }

    private String explanation() {
        long now = System.currentTimeMillis();
        if ("mandatory_log".equals(reason)) {
            String deadline = ProtectionStore.config(this).optString("logDeadline", "20:30");
            return "Your daily entry was due at " + deadline
                + ". Open Tend to complete it before continuing with " + appDisplayName + ".";
        }
        if ("morning_lock".equals(reason)) {
            long remaining = ProtectionStore.wakeLockRemainingMs(this, now);
            long minutesLeft = Math.max(1, (long) Math.ceil(remaining / 60000.0));
            return "Your morning focus is protected for about " + minutesLeft
                + " more minute" + (minutesLeft == 1 ? "" : "s") + ". Open Tend when you are ready to begin.";
        }
        if ("tasks".equals(reason)) {
            int pending = ProtectionStore.pendingTasks(this, now);
            return appDisplayName + " is resting while " + pending + " unfinished "
                + (pending == 1 ? "task needs" : "tasks need") + " your attention.";
        }
        if ("cooldown".equals(reason)) {
            long remaining = ProtectionStore.cooldownRemainingMs(this, now);
            long minutesLeft = Math.max(1, (long) Math.ceil(remaining / 60000.0));
            return "Your work is complete. " + appDisplayName + " will return after a "
                + minutesLeft + "-minute cooldown buffer.";
        }
        if ("budget".equals(reason)) {
            return String.format(Locale.US,
                "You have used about %.0f minutes in %s today. Your daily limit is %d minutes.",
                minutes, appDisplayName, budget);
        }
        return appDisplayName
            + " is resting until your focus timer finishes. One small thing at a time.";
    }

    private String returnLabel() {
        if ("mandatory_log".equals(reason)) return "Open Tend & Log Entry";
        if ("morning_lock".equals(reason)) return "Open Tend & Morning Routine";
        if ("tasks".equals(reason)) return "Back to my tasks";
        if ("focus".equals(reason)) return "Back to my focus";
        return "Back to Tend";
    }

    private String settingsLabel() {
        return "mandatory_log".equals(reason) || "morning_lock".equals(reason)
            ? "Emergency & Accessibility Settings" : "Manage or turn off protection";
    }

    private boolean canRequestTemporaryBreak() {
        return !"mandatory_log".equals(reason) && !"morning_lock".equals(reason);
    }

    private void addQuickPassControls(LinearLayout content) {
        TextView guidance = text(
            "Make it intentional. Write a reason, pause for 10 seconds, then allow 10 minutes. "
                + "Your reason stays only on this device.",
            16, MUTED, false);
        guidance.setPadding(0, dp(8), 0, dp(8));
        content.addView(guidance);
        quickPassInput = new EditText(this);
        quickPassInput.setHint("What do you need to do?");
        quickPassInput.setContentDescription("Temporary break reason");
        quickPassInput.setSingleLine(false);
        quickPassInput.setMaxLines(3);
        quickPassInput.setText(quickPassDraft);
        quickPassInput.setTextSize(18);
        quickPassInput.setTextColor(FOREST);
        quickPassInput.setHintTextColor(MUTED);
        quickPassInput.setBackgroundColor(Color.TRANSPARENT);
        quickPassInput.setPadding(dp(4), dp(8), dp(4), dp(8));
        content.addView(quickPassInput, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        quickPassAction = button(deliberationStarted > 0 ? "Take a breath" : "Pause for 10 seconds", false);
        quickPassAction.setContentDescription("Temporary break action");
        quickPassAction.setOnClickListener(view -> advanceTemporaryBreak());
        content.addView(quickPassAction);
    }

    private void advanceTemporaryBreak() {
        if (quickPassInput == null || quickPassAction == null) return;
        quickPassDraft = quickPassInput.getText().toString().trim();
        if (quickPassDraft.length() < 3) {
            Toast.makeText(this, "Write a short reason first.", Toast.LENGTH_SHORT).show();
            quickPassInput.requestFocus();
            return;
        }
        if (deliberationStarted == 0) {
            deliberationStarted = SystemClock.elapsedRealtime();
            quickPassInput.clearFocus();
            InputMethodManager keyboard = getSystemService(InputMethodManager.class);
            if (keyboard != null) keyboard.hideSoftInputFromWindow(quickPassInput.getWindowToken(), 0);
            updateCountdown();
            return;
        }
        long elapsed = SystemClock.elapsedRealtime() - deliberationStarted;
        if (elapsed < ProtectionStore.DELIBERATION_MS) {
            updateCountdown();
            return;
        }
        if (ProtectionStore.allow(this, targetPackage, quickPassDraft, deliberationStarted)) {
            Toast.makeText(this, appDisplayName + " is available for 10 minutes.", Toast.LENGTH_SHORT).show();
            finish();
        } else {
            Toast.makeText(this, "The temporary break was not granted. Please try again.", Toast.LENGTH_LONG).show();
            deliberationStarted = 0;
            updateCountdown();
        }
    }

    private void updateCountdown() {
        if (quickPassAction == null || deliberationStarted <= 0) return;
        long elapsed = Math.max(0, SystemClock.elapsedRealtime() - deliberationStarted);
        long remaining = Math.max(0, ProtectionStore.DELIBERATION_MS - elapsed);
        if (remaining > 0) {
            long seconds = Math.max(1, (long) Math.ceil(remaining / 1000.0));
            quickPassAction.setText("Take a breath · " + seconds + "s");
            quickPassAction.setEnabled(false);
            main.postDelayed(this::updateCountdown, Math.min(1000, remaining));
        } else {
            quickPassAction.setText("Allow 10 minutes");
            quickPassAction.setEnabled(true);
            quickPassAction.setOnClickListener(view -> advanceTemporaryBreak());
        }
    }

    private void openTend() {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if ("mandatory_log".equals(reason)) intent.setAction("app.tend.ACTION_MANDATORY_LOG");
        startActivity(intent);
        finish();
    }

    private void openAccessibilitySettings() {
        try {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        } catch (ActivityNotFoundException unavailable) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
        finish();
    }

    private void goHome() {
        Intent home = new Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_HOME)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(home);
        finish();
    }

    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() {
        goHome();
    }

    @Override protected void onResume() {
        super.onResume();
        if (!isStillLocked()) finish();
    }

    @Override protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        LockActivity active = activeInstance.get();
        if (active == this) activeInstance = new WeakReference<>(null);
        super.onDestroy();
    }

    private void applyWindowInsets(View view) {
        view.setOnApplyWindowInsetsListener((target, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                target.setPadding(dp(24) + safe.left, dp(32) + safe.top,
                    dp(24) + safe.right, dp(32) + safe.bottom);
            } else {
                target.setPadding(dp(24) + insets.getSystemWindowInsetLeft(),
                    dp(32) + insets.getSystemWindowInsetTop(),
                    dp(24) + insets.getSystemWindowInsetRight(),
                    dp(32) + insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView text(String value, int size, int color, boolean serif) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(Typeface.create(serif ? "serif" : "sans-serif", Typeface.NORMAL));
        view.setLineSpacing(0, 1.12f);
        return view;
    }

    private Button button(String label, boolean primary) {
        Button view = new Button(this);
        view.setText(label);
        view.setAllCaps(false);
        view.setTextSize(16);
        view.setTextColor(primary ? Color.WHITE : FOREST);
        GradientDrawable background = new GradientDrawable();
        background.setColor(primary ? FOREST : PAPER);
        background.setCornerRadius(dp(18));
        if (!primary) background.setStroke(dp(1), BORDER);
        view.setBackground(background);
        view.setMinHeight(dp(56));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(6), 0, dp(6));
        view.setLayoutParams(params);
        return view;
    }
}
