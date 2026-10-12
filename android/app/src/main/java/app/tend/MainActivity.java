package app.tend;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int EXPORT = 200, IMPORT = 201;
    private WebView web;
    private StateStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private boolean pageReady;
    private volatile boolean storageReadFailed;
    private String pendingEvent;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        store = new StateStore(this);
        Notifications.createChannels(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247,245,238));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new NativeBridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loadAsset(request.getUrl());
            }
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingEvent != null) { web.evaluateJavascript(pendingEvent, null); pendingEvent = null; }
                emit("tend-native-ready", "ready");
                checkMandatoryIntent(getIntent());
            }
        });
        setContentView(web);
        // Keep the touch targets outside status, gesture-navigation, and keyboard areas.
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web.getRootView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        web.loadUrl("https://" + HOST + "/index.html");
        io.execute(() -> { AlarmScheduler.restore(this); UsageMonitor.schedule(this); });
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1 && uri.getUserInfo() == null;
    }
    private WebResourceResponse loadAsset(Uri uri) {
        if (!isLocal(uri)) return denied(403, "Forbidden");
        String path = uri.getPath();
        if (path == null || path.contains("..") || path.contains("\\")) return denied(403, "Forbidden");
        if ("/".equals(path)) path = "/index.html";
        try {
            InputStream input = getAssets().open("public" + path);
            String extension = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
            String mime = switch (extension) {
                case "html" -> "text/html";
                case "js", "mjs" -> "text/javascript";
                case "css" -> "text/css";
                case "json", "webmanifest" -> "application/json";
                case "svg" -> "image/svg+xml";
                case "png" -> "image/png";
                case "jpg", "jpeg" -> "image/jpeg";
                case "webp" -> "image/webp";
                case "ico" -> "image/x-icon";
                case "woff2" -> "font/woff2";
                case "woff" -> "font/woff";
                case "ttf" -> "font/ttf";
                case "mp3" -> "audio/mpeg";
                default -> "application/octet-stream";
            };
            Map<String,String> headers = new HashMap<>();
            headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'");
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, input);
        } catch (Exception e) { return denied(404, "Not Found"); }
    }
    private static WebResourceResponse denied(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private void emit(String event, String detail) {
        runOnUiThread(() -> {
            if (web == null) return;
            String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(event) + ",{detail:" + JSONObject.quote(detail) + "}))";
            if (pageReady) web.evaluateJavascript(script, null); else pendingEvent = script;
        });
    }
    private void toast(String message) { runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }
    @Override public void onResume() {
        super.onResume();
        AlarmRinger.stopAlarm(this);
        TendTasksWidgetProvider.updateAll(this);
        TendTimerWidgetProvider.updateAll(this);
        if (web != null) {
            web.onResume(); emit("tend-capabilities-changed", "refresh");
            io.execute(() -> { AlarmScheduler.restore(this); UsageMonitor.schedule(this); });
        }
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        checkMandatoryIntent(intent);
    }
    private void checkMandatoryIntent(Intent intent) {
        if (intent != null && "app.tend.ACTION_MANDATORY_LOG".equals(intent.getAction())) {
            AlarmRinger.stopAlarm(this);
            emit("tend-open-log", "mandatory");
        }
    }
    @Override public void onPause() { if (web != null) web.onPause(); super.onPause(); }
    // Android 13+ uses OnBackInvokedDispatcher above; this branch supports Android 8–12.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    private void handleBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("!window.dispatchEvent(new Event('tend-back',{cancelable:true}))", consumed -> {
            if ("true".equals(consumed)) return;
            if (web != null && web.canGoBack()) web.goBack(); else finish();
        });
    }
    @Override public void onDestroy() {
        io.shutdown();
        if (web != null) { web.removeJavascriptInterface("AndroidBridge"); web.destroy(); web = null; }
        // SQLite helper is process scoped; closing here could race an in-flight bridge save.
        super.onDestroy();
    }

    public final class NativeBridge {
        @JavascriptInterface public String loadState() {
            try { String json = store.load(); if (json != null) ProtectionStore.syncSnapshot(MainActivity.this, json); return json; } catch (Exception e) { storageReadFailed = true; emit("tend-native-error", "Could not read local database. Restart Tend before making changes."); return "__TEND_STORAGE_READ_ERROR__"; }
        }
        @JavascriptInterface public boolean saveState(String json) {
            if (storageReadFailed) return false;
            try {
                boolean saved = store.save(json);
                if (saved) {
                    ProtectionStore.syncSnapshot(MainActivity.this, json);
                    TendTasksWidgetProvider.updateAll(MainActivity.this);
                    TendTimerWidgetProvider.updateAll(MainActivity.this);
                }
                return saved;
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface public String getCapabilities() {
            try {
                return new JSONObject().put("platform", "android")
                    .put("notifications", Notifications.allowed(MainActivity.this))
                    .put("usageAccess", UsageMonitor.hasAccess(MainActivity.this))
                    .put("accessibility", ProtectionStore.accessibility(MainActivity.this))
                    .put("protectionEnabled", ProtectionStore.config(MainActivity.this).optBoolean("enabled", false))
                    .put("exactAlarms", AlarmScheduler.hasExactAccess(MainActivity.this)).toString();
            } catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface public void requestPermission(String kind) {
            runOnUiThread(() -> {
                try {
                    switch (kind) {
                        case "notifications":
                            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 100);
                            } else openNotificationSettings();
                            break;
                        case "usage": startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + getPackageName()))); break;
                        case "accessibility": startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); break;
                        case "alarms":
                            if (Build.VERSION.SDK_INT >= 31) startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
                            break;
                        default: break;
                    }
                } catch (ActivityNotFoundException e) { toast("Open Android Settings to enable this permission for Tend."); }
            });
        }
        @JavascriptInterface public void openNotificationSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); }
                catch (ActivityNotFoundException e) { toast("Notification settings are unavailable on this device."); }
            });
        }
        @JavascriptInterface public String getUsage() { return UsageMonitor.today(MainActivity.this).toString(); }
        @JavascriptInterface public String getProtectionState() { return ProtectionStore.state(MainActivity.this).toString(); }
        @JavascriptInterface public String getInstalledApps() {
            try {
                PackageManager pm = getPackageManager();
                Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
                mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                java.util.List<ResolveInfo> activities = pm.queryIntentActivities(mainIntent, 0);
                JSONArray result = new JSONArray();
                java.util.HashSet<String> seen = new java.util.HashSet<>();
                for (ResolveInfo ri : activities) {
                    if (ri.activityInfo == null) continue;
                    String pkg = ri.activityInfo.packageName;
                    if (pkg == null || seen.contains(pkg) || ProtectionStore.isExempt(pkg)) continue;
                    seen.add(pkg);
                    String label = "";
                    try {
                        CharSequence cs = ri.loadLabel(pm);
                        if (cs != null) label = cs.toString().trim();
                    } catch (Exception ignored) { }
                    if (label.isEmpty()) label = ProtectionStore.name(MainActivity.this, pkg);
                    boolean isGame = false;
                    try {
                        ApplicationInfo appInfo = pm.getApplicationInfo(pkg, 0);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            isGame = (appInfo.category == ApplicationInfo.CATEGORY_GAME);
                        }
                        if (!isGame) {
                            isGame = (appInfo.flags & ApplicationInfo.FLAG_IS_GAME) != 0;
                        }
                    } catch (Exception ignored) { }
                    JSONObject item = new JSONObject();
                    item.put("packageName", pkg);
                    item.put("name", label);
                    item.put("isGame", isGame);
                    result.put(item);
                }
                return result.toString();
            } catch (Exception e) {
                return "[]";
            }
        }
        @JavascriptInterface public boolean verifyParentalPin(String pin) {
            return ProtectionStore.verifyParentalPin(MainActivity.this, pin);
        }
        @JavascriptInterface public boolean configureProtection(String json) {
            try {
                boolean saved = ProtectionStore.configure(MainActivity.this, new JSONObject(json));
                if (saved) {
                    AlarmScheduler.scheduleLogDeadline(MainActivity.this);
                    emit("tend-capabilities-changed", "refresh");
                }
                return saved;
            } catch (Exception ignored) { return false; }
        }
        @JavascriptInterface public boolean completeDailyLog() {
            AlarmRinger.stopAlarm(MainActivity.this);
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            boolean saved = ProtectionStore.completeDailyLog(MainActivity.this, today);
            if (saved) emit("tend-capabilities-changed", "refresh");
            return saved;
        }
        @JavascriptInterface public void stopAlarm() {
            AlarmRinger.stopAlarm(MainActivity.this);
        }
        @JavascriptInterface public boolean isLogPending() {
            return ProtectionStore.isMandatoryLogPending(MainActivity.this);
        }
        @JavascriptInterface public boolean scheduleAlarm(String id, String time, String label) {
            return AlarmScheduler.saveDaily(MainActivity.this, id, time, label);
        }
        @JavascriptInterface public void cancelAlarm(String id) { AlarmScheduler.cancel(MainActivity.this, id); }
        @JavascriptInterface public void scheduleTimer(double endMs, String title) { AlarmScheduler.timer(MainActivity.this, (long)endMs, title); }
        @JavascriptInterface public void cancelTimer() { AlarmScheduler.cancelTimer(MainActivity.this); }
        @JavascriptInterface public void configureLimits(String json) {
            try {
                JSONObject input = new JSONObject(json);
                JSONObject limits = new JSONObject().put("enabled",input.optBoolean("enabled",false))
                    .put("instagram", Math.max(1,Math.min(1440,input.optInt("instagram",30))))
                    .put("youtube", Math.max(1,Math.min(1440,input.optInt("youtube",30))));
                android.content.SharedPreferences preferences = getSharedPreferences("native", MODE_PRIVATE);
                JSONObject previous = new JSONObject(preferences.getString("limits", "{}"));
                android.content.SharedPreferences.Editor edit = preferences.edit().putString("limits", limits.toString());
                if (previous.optInt("instagram", 30) != limits.optInt("instagram")) edit.putInt("warn-0", 0);
                if (previous.optInt("youtube", 30) != limits.optInt("youtube")) edit.putInt("warn-1", 0);
                edit.commit();
                UsageMonitor.schedule(MainActivity.this);
                io.execute(() -> UsageMonitor.checkLimits(MainActivity.this));
            } catch (Exception e) { emit("tend-native-error", "Unable to update distraction reminders."); }
        }
        @JavascriptInterface public void saveBackup(String json) {
            if (json == null || json.length() > StateStore.MAX_BYTES) { toast("Backup is too large."); return; }
            io.execute(() -> {
                try {
                    new JSONObject(json);
                    try (OutputStream out = openFileOutput("pending-export.json", MODE_PRIVATE)) { out.write(json.getBytes(StandardCharsets.UTF_8)); }
                    runOnUiThread(() -> {
                        String date = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
                        try { startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"tend-backup-" + date + ".json"), EXPORT); }
                        catch (ActivityNotFoundException e) { toast("This device has no document picker."); }
                    });
                } catch (Exception e) { toast("Unable to prepare the backup."); }
            });
        }
        @JavascriptInterface public void importBackup() {
            runOnUiThread(() -> {
                try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), IMPORT); }
                catch (ActivityNotFoundException e) { toast("This device has no document picker."); }
            });
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode,permissions,grantResults);
        emit("tend-capabilities-changed", "refresh");
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        io.execute(() -> {
            try {
                if (requestCode == EXPORT) {
                    try (InputStream input = openFileInput("pending-export.json"); OutputStream output = getContentResolver().openOutputStream(uri,"wt")) {
                        if (output == null) throw new IllegalStateException("No writable stream");
                        byte[] buffer = new byte[8192]; int count;
                        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    }
                    deleteFile("pending-export.json");
                    emit("tend-backup-exported", "saved"); toast("Backup saved.");
                } else if (requestCode == IMPORT) {
                    try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                        if (input == null) throw new IllegalStateException("No readable stream");
                        byte[] buffer = new byte[8192]; int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (bytes.size() + count > StateStore.MAX_BYTES) throw new IllegalArgumentException("Backup exceeds 25 MB");
                            bytes.write(buffer,0,count);
                        }
                        String json = bytes.toString(StandardCharsets.UTF_8.name());
                        new JSONObject(json);
                        emit("tend-backup-import", json);
                    }
                }
            } catch (Exception e) { toast("Could not read or save that file. Your existing data is unchanged."); }
        });
    }
}
