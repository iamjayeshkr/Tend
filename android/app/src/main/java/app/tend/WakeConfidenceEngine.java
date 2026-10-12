package app.tend;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.TriggerEvent;
import android.hardware.TriggerEventListener;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityRecognitionClient;
import com.google.android.gms.location.SleepClassifyEvent;
import com.google.android.gms.location.SleepSegmentEvent;
import com.google.android.gms.location.SleepSegmentRequest;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONObject;

/**
 * Morning Wake Session & Confirmed Awake Time Engine.
 *
 * Implements the state machine:
 *   SLEEPING -> WAKE DETECTED -> MORNING_PROTECTED ->
 *     (Resleep detected -> SLEEPING -> WAKE DETECTED AGAIN) /
 *     (Target awake minutes completed -> NORMAL)
 *
 * Fuses Google Play Services Sleep API, Android hardware motion sensors
 * (Significant Motion & Step Detector), screen interaction, and inactivity timeouts.
 */
public final class WakeConfidenceEngine {
    private static final String TAG = "WakeConfidenceEngine";

    public static final String STATE_SLEEPING = "SLEEPING";
    public static final String STATE_PROTECTED = "PROTECTED";
    public static final String STATE_NORMAL = "NORMAL";

    private static final long DEFAULT_TARGET_AWAKE_MS = 60 * 60 * 1000L; // 60 minutes
    private static final long RESLEEP_INACTIVITY_THRESHOLD_MS = 45 * 60 * 1000L; // 45 minutes
    private static final long ACTIVE_CONTINUATION_WINDOW_MS = 15 * 60 * 1000L; // 15 minutes
    private static final long DEEP_SLEEP_RESET_THRESHOLD_MS = 45 * 60 * 1000L; // 45 minutes

    private static WakeConfidenceEngine instance;
    private final Context appContext;
    private final SensorManager sensorManager;
    private final Sensor sigMotionSensor;
    private final Sensor stepDetectorSensor;

    private boolean isListeningToSensors = false;
    private boolean isSleepApiRequested = false;

    private final TriggerEventListener sigMotionListener = new TriggerEventListener() {
        @Override
        public void onTrigger(TriggerEvent event) {
            onPhysicalMovementDetected(System.currentTimeMillis(), "significant_motion");
            rearmSignificantMotion();
        }
    };

    private final SensorEventListener stepListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event == null || event.values == null || event.values.length == 0) return;
            onPhysicalMovementDetected(System.currentTimeMillis(), "step");
        }
        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) { }
    };

    private WakeConfidenceEngine(Context context) {
        this.appContext = context.getApplicationContext();
        this.sensorManager = (SensorManager) appContext.getSystemService(Context.SENSOR_SERVICE);
        Sensor sig = null;
        Sensor step = null;
        if (sensorManager != null) {
            sig = sensorManager.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION);
            step = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
        }
        this.sigMotionSensor = sig;
        this.stepDetectorSensor = step;
    }

    public static synchronized WakeConfidenceEngine getInstance(Context context) {
        if (instance == null) {
            instance = new WakeConfidenceEngine(context);
        }
        return instance;
    }

    private SharedPreferences prefs() {
        return ProtectionStore.prefs(appContext);
    }

    private String todayDate(long now) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
    }

    public boolean isInMorningWindow(long now) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        return hour >= 4 && hour < 12;
    }

    public synchronized String getWakeState(long now) {
        String today = todayDate(now);
        String recordedDate = prefs().getString("wakeDate", "");
        if (!today.equals(recordedDate)) {
            return STATE_SLEEPING;
        }
        return prefs().getString("wakeState", STATE_SLEEPING);
    }

    public synchronized long getTargetAwakeMs() {
        JSONObject config = ProtectionStore.config(appContext);
        int minutes = config.optInt("wakeLockMinutes", 60);
        return minutes * 60_000L;
    }

    public synchronized void onUserInteraction(long now) {
        prefs().edit().putLong("wakeLastActiveMs", now).apply();
    }

    public synchronized long getAccumulatedAwakeMs(long now) {
        String today = todayDate(now);
        String recordedDate = prefs().getString("wakeDate", "");
        if (!today.equals(recordedDate)) return 0;

        long accumulated = prefs().getLong("wakeAccumulatedAwakeMs", 0);
        String state = prefs().getString("wakeState", STATE_SLEEPING);

        // If screen is currently interactive, add the in-progress screen-on session
        if (STATE_PROTECTED.equals(state)) {
            PowerManager power = (PowerManager) appContext.getSystemService(Context.POWER_SERVICE);
            boolean isInteractive = (power != null && power.isInteractive());
            if (isInteractive) {
                long screenOn = prefs().getLong("wakeLastScreenOnMs", 0);
                if (screenOn <= 0) {
                    screenOn = prefs().getLong("wakeSessionStartMs", now);
                    prefs().edit().putLong("wakeLastScreenOnMs", screenOn).apply();
                }
                if (now > screenOn) {
                    accumulated += (now - screenOn);
                }
            }
        }
        return accumulated;
    }

    public synchronized long getRemainingAwakeMs(long now) {
        long target = getTargetAwakeMs();
        long accumulated = getAccumulatedAwakeMs(now);
        return target > accumulated ? (target - accumulated) : 0;
    }

    public synchronized boolean isWakeLockActive(long now) {
        JSONObject config = ProtectionStore.config(appContext);
        if (!config.optBoolean("enabled", false) || !config.optBoolean("wakeLockEnabled", false)) return false;

        evaluateResleep(now);

        String state = getWakeState(now);
        if (!STATE_PROTECTED.equals(state)) return false;

        long remaining = getRemainingAwakeMs(now);
        String mode = config.optString("wakeLockMode", "timer");
        String today = todayDate(now);

        if ("tasks".equals(mode)) {
            int pending = ProtectionStore.pendingTasks(appContext, now);
            return pending > 0 || remaining > 0;
        } else if ("log".equals(mode)) {
            return !ProtectionStore.isDailyLogDone(appContext, today) || remaining > 0;
        } else {
            return remaining > 0;
        }
    }

    public synchronized void onScreenOn(long now) {
        prefs().edit().putLong("wakeLastScreenOnMs", now).putLong("wakeLastActiveMs", now).apply();
        evaluateWakeTrigger(now, "screen_on");
    }

    public synchronized void onScreenOff(long now) {
        String today = todayDate(now);
        String recordedDate = prefs().getString("wakeDate", "");
        if (today.equals(recordedDate)) {
            long screenOn = prefs().getLong("wakeLastScreenOnMs", 0);
            if (screenOn > 0 && now > screenOn) {
                long session = now - screenOn;
                long current = prefs().getLong("wakeAccumulatedAwakeMs", 0);
                long updated = current + session;
                prefs().edit()
                    .putLong("wakeAccumulatedAwakeMs", updated)
                    .putLong("wakeLastScreenOffMs", now)
                    .putLong("wakeLastActiveMs", now)
                    .apply();

                checkCompletion(now, updated);
            }
        } else {
            prefs().edit()
                .putLong("wakeLastScreenOffMs", now)
                .putLong("wakeLastActiveMs", now)
                .apply();
        }
    }

    public synchronized void onWakeAlarmFired(long now) {
        evaluateWakeTrigger(now, "wake_alarm");
    }

    public synchronized void onSleepSegmentEvents(List<SleepSegmentEvent> events) {
        if (events == null || events.isEmpty()) return;
        long now = System.currentTimeMillis();
        for (SleepSegmentEvent event : events) {
            if (event.getStatus() == SleepSegmentEvent.STATUS_SUCCESSFUL) {
                long endTime = event.getEndTimeMillis();
                if (isInMorningWindow(endTime) && endTime <= now) {
                    evaluateWakeTrigger(endTime, "sleep_segment_end");
                }
            }
        }
    }

    public synchronized void onSleepClassifyEvents(List<SleepClassifyEvent> events) {
        if (events == null || events.isEmpty()) return;
        long now = System.currentTimeMillis();
        for (SleepClassifyEvent event : events) {
            int confidence = event.getConfidence(); // 0 to 100
            int motion = event.getMotion(); // 1 to 6
            if (confidence <= 30 || motion >= 4) {
                // High confidence awake
                onPhysicalMovementDetected(now, "sleep_classify_awake");
            } else if (confidence >= 75 && motion <= 2) {
                // High confidence sleeping
                evaluateResleepFromSignal(now);
            }
        }
    }

    private synchronized void onPhysicalMovementDetected(long now, String source) {
        if (!isInMorningWindow(now)) return;

        String today = todayDate(now);
        String recordedDate = prefs().getString("wakeDate", "");
        String state = getWakeState(now);

        if (STATE_PROTECTED.equals(state) && today.equals(recordedDate)) {
            long lastActive = prefs().getLong("wakeLastActiveMs", 0);
            if (lastActive > 0 && now > lastActive && (now - lastActive) <= ACTIVE_CONTINUATION_WINDOW_MS) {
                // User was recently moving/awake: credit the elapsed awake time
                long elapsed = now - lastActive;
                long current = prefs().getLong("wakeAccumulatedAwakeMs", 0);
                long updated = current + elapsed;
                prefs().edit().putLong("wakeAccumulatedAwakeMs", updated).apply();
                checkCompletion(now, updated);
            }
            prefs().edit().putLong("wakeLastActiveMs", now).apply();
        } else if (STATE_SLEEPING.equals(state)) {
            // Movement during morning window can indicate waking up!
            evaluateWakeTrigger(now, source);
        }
    }

    public synchronized void evaluateWakeTrigger(long now, String triggerSource) {
        if (!isInMorningWindow(now)) return;

        JSONObject config = ProtectionStore.config(appContext);
        if (!config.optBoolean("enabled", false) || !config.optBoolean("wakeLockEnabled", false)) return;

        String today = todayDate(now);
        String recordedDate = prefs().getString("wakeDate", "");
        String currentState = prefs().getString("wakeState", STATE_SLEEPING);

        if (!today.equals(recordedDate)) {
            // First wake of the day
            startMorningSession(now, today, false);
            return;
        }

        if (STATE_SLEEPING.equals(currentState)) {
            // Secondary wake after resleep!
            long resleepStart = prefs().getLong("wakeResleepStartMs", 0);
            long sleepDuration = (resleepStart > 0 && now > resleepStart) ? (now - resleepStart) : 0;
            String resleepPolicy = config.optString("wakeLockResleepPolicy", "reset");

            boolean isDeepSleep = sleepDuration >= DEEP_SLEEP_RESET_THRESHOLD_MS;
            boolean shouldReset = isDeepSleep && "reset".equals(resleepPolicy);

            if (shouldReset) {
                // Reset full duration
                prefs().edit()
                    .putLong("wakeAccumulatedAwakeMs", 0)
                    .putString("wakeState", STATE_PROTECTED)
                    .putLong("wakeSessionStartMs", now)
                    .putLong("wakeLastScreenOnMs", now)
                    .putLong("wakeLastActiveMs", now)
                    .putBoolean("wakeIsResleep", true)
                    .apply();
            } else {
                // Resume with remaining awake time
                prefs().edit()
                    .putString("wakeState", STATE_PROTECTED)
                    .putLong("wakeSessionStartMs", now)
                    .putLong("wakeLastScreenOnMs", now)
                    .putLong("wakeLastActiveMs", now)
                    .putBoolean("wakeIsResleep", true)
                    .apply();
            }

            armSensors();
            TendTasksWidgetProvider.updateAll(appContext);
            TendTimerWidgetProvider.updateAll(appContext);
        }
    }

    private synchronized void startMorningSession(long now, String today, boolean isEarly) {
        long targetMs = getTargetAwakeMs();
        prefs().edit()
            .putString("wakeDate", today)
            .putString("wakeState", STATE_PROTECTED)
            .putLong("wakeSessionStartMs", now)
            .putLong("wakeTargetAwakeMs", targetMs)
            .putLong("wakeAccumulatedAwakeMs", 0)
            .putLong("wakeLastScreenOnMs", now)
            .putLong("wakeLastActiveMs", now)
            .putLong("wakeResleepStartMs", 0)
            .putBoolean("wakeIsResleep", false)
            .putBoolean("isEarlyWake", isEarly)
            // Backward compatibility fields
            .putLong("wakeTimeToday", now)
            .putString("wakeLockDate", today)
            .putLong("wakeLockUntil", now + targetMs)
            .apply();

        armSensors();
        requestSleepUpdates();
        TendTasksWidgetProvider.updateAll(appContext);
        TendTimerWidgetProvider.updateAll(appContext);
    }

    public synchronized void evaluateResleep(long now) {
        String state = getWakeState(now);
        if (!STATE_PROTECTED.equals(state)) return;

        PowerManager power = (PowerManager) appContext.getSystemService(Context.POWER_SERVICE);
        if (power != null && power.isInteractive()) {
            // User is actively interacting with the device screen
            prefs().edit().putLong("wakeLastActiveMs", now).apply();
            return;
        }

        long lastActive = prefs().getLong("wakeLastActiveMs", 0);
        long inactivity = (lastActive > 0 && now > lastActive) ? (now - lastActive) : 0;

        if (inactivity >= RESLEEP_INACTIVITY_THRESHOLD_MS) {
            // User has been completely inactive with screen off for 45+ minutes -> Resleep detected!
            prefs().edit()
                .putString("wakeState", STATE_SLEEPING)
                .putLong("wakeResleepStartMs", lastActive > 0 ? lastActive : now - RESLEEP_INACTIVITY_THRESHOLD_MS)
                .apply();

            TendTasksWidgetProvider.updateAll(appContext);
            TendTimerWidgetProvider.updateAll(appContext);
        }
    }

    private synchronized void evaluateResleepFromSignal(long now) {
        String state = getWakeState(now);
        if (!STATE_PROTECTED.equals(state)) return;

        PowerManager power = (PowerManager) appContext.getSystemService(Context.POWER_SERVICE);
        if (power != null && power.isInteractive()) return;

        long lastActive = prefs().getLong("wakeLastActiveMs", 0);
        long inactivity = (lastActive > 0 && now > lastActive) ? (now - lastActive) : 0;

        // If sleep confidence is high and screen has been off for at least 20 minutes -> Resleep detected!
        if (inactivity >= 20 * 60 * 1000L) {
            prefs().edit()
                .putString("wakeState", STATE_SLEEPING)
                .putLong("wakeResleepStartMs", lastActive > 0 ? lastActive : now)
                .apply();

            TendTasksWidgetProvider.updateAll(appContext);
            TendTimerWidgetProvider.updateAll(appContext);
        }
    }

    private synchronized void checkCompletion(long now, long accumulated) {
        long target = getTargetAwakeMs();
        if (accumulated >= target) {
            prefs().edit()
                .putString("wakeState", STATE_NORMAL)
                .putLong("wakeLockUntil", 0)
                .apply();
            disarmSensors();
            TendTasksWidgetProvider.updateAll(appContext);
            TendTimerWidgetProvider.updateAll(appContext);
        }
    }

    public synchronized void manualConfirmAwake(long wakeTimestamp) {
        long now = System.currentTimeMillis();
        String today = todayDate(now);
        long elapsed = (wakeTimestamp > 0 && now > wakeTimestamp) ? (now - wakeTimestamp) : 0;
        long target = getTargetAwakeMs();

        prefs().edit()
            .putString("wakeDate", today)
            .putLong("wakeSessionStartMs", wakeTimestamp)
            .putLong("wakeAccumulatedAwakeMs", elapsed)
            .putLong("wakeLastActiveMs", now)
            .putString("wakeState", elapsed >= target ? STATE_NORMAL : STATE_PROTECTED)
            .apply();

        TendTasksWidgetProvider.updateAll(appContext);
        TendTimerWidgetProvider.updateAll(appContext);
    }

    public synchronized void armSensors() {
        if (isListeningToSensors) return;
        try {
            if (sigMotionSensor != null) {
                sensorManager.requestTriggerSensor(sigMotionListener, sigMotionSensor);
            }
            if (stepDetectorSensor != null) {
                sensorManager.registerListener(stepListener, stepDetectorSensor, SensorManager.SENSOR_DELAY_NORMAL);
            }
            isListeningToSensors = true;
        } catch (Throwable t) {
            Log.w(TAG, "Failed to arm motion sensors", t);
        }
    }

    public synchronized void disarmSensors() {
        if (!isListeningToSensors) return;
        try {
            if (sigMotionSensor != null) {
                sensorManager.cancelTriggerSensor(sigMotionListener, sigMotionSensor);
            }
            if (stepDetectorSensor != null) {
                sensorManager.unregisterListener(stepListener);
            }
            isListeningToSensors = false;
        } catch (Throwable t) {
            Log.w(TAG, "Failed to disarm motion sensors", t);
        }
    }

    private synchronized void rearmSignificantMotion() {
        try {
            if (sigMotionSensor != null && isListeningToSensors) {
                sensorManager.requestTriggerSensor(sigMotionListener, sigMotionSensor);
            }
        } catch (Throwable ignored) { }
    }

    public synchronized void requestSleepUpdates() {
        if (isSleepApiRequested) return;
        if (ContextCompat.checkSelfPermission(appContext, "android.permission.ACTIVITY_RECOGNITION") != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            ActivityRecognitionClient client = ActivityRecognition.getClient(appContext);
            Intent intent = new Intent(appContext, SleepReceiver.class);
            intent.setAction("app.tend.ACTION_SLEEP_SEGMENT_EVENT");
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) {
                flags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(appContext, 1001, intent, flags);
            client.requestSleepSegmentUpdates(pendingIntent, SleepSegmentRequest.getDefaultSleepSegmentRequest());
            isSleepApiRequested = true;
        } catch (Throwable t) {
            Log.w(TAG, "Google Play Services Sleep API unavailable", t);
        }
    }
}
