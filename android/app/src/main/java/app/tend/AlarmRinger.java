package app.tend;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

public final class AlarmRinger {
    private static Ringtone activeRingtone = null;
    private static AudioTrack synthTrack = null;
    private static PowerManager.WakeLock wakeLock = null;
    private static boolean isRinging = false;
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static final Runnable autoStop = AlarmRinger::stopAlarm;

    public static synchronized void startAlarm(Context context) {
        if (isRinging) return;
        isRinging = true;

        // 1. Force hardware alarm volume to 100% MAXIMUM
        try {
            AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audio != null) {
                int maxVol = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                audio.setStreamVolume(AudioManager.STREAM_ALARM, maxVol, 0);
            }
        } catch (Exception ignored) { }

        // 2. Turn on and keep screen / CPU awake
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && (wakeLock == null || !wakeLock.isHeld())) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "tend:alarm_ring");
                wakeLock.acquire(180_000L); // 3 minutes maximum
            }
        } catch (Exception ignored) { }

        // 3. Play high-penetration 500% piercing acoustic synth track (AudioTrack)
        startSynthSiren();

        // 4. Play default system alarm ringtone layered simultaneously
        try {
            Uri alarmUri = RingtoneManager.getActualDefaultRingtoneUri(context.getApplicationContext(), RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            activeRingtone = RingtoneManager.getRingtone(context.getApplicationContext(), alarmUri);
            if (activeRingtone != null) {
                if (Build.VERSION.SDK_INT >= 28) {
                    activeRingtone.setLooping(true);
                }
                activeRingtone.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                );
                activeRingtone.play();
            }
        } catch (Exception ignored) { }

        // 5. Deep-sleep waking vibration pattern (rapid bursts prevent sensory adaptation)
        try {
            Vibrator vibrator = getVibrator(context);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = new long[]{0, 250, 80, 250, 80, 250, 80, 600, 200};
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) { }

        // Auto timeout after 3 minutes (180s) to guarantee wake-up while protecting battery
        main.removeCallbacks(autoStop);
        main.postDelayed(autoStop, 180_000L);
    }

    private static void startSynthSiren() {
        try {
            int sampleRate = 44100;
            short[] buffer = new short[sampleRate];
            for (int i = 0; i < sampleRate; i++) {
                double t = (double) i / sampleRate;
                double cycle = (t * 4.0) % 1.0;
                if (cycle < 0.6) {
                    // Alternating 1046.5 Hz (C6) and 1396.9 Hz (F6) piercing frequencies
                    double f = ((int)(t * 4.0) % 2 == 0) ? 1046.5 : 1396.9;
                    double s = Math.sin(2.0 * Math.PI * f * t)
                             + 0.5 * Math.sin(2.0 * Math.PI * (f * 2.0) * t)
                             + 0.25 * Math.sin(2.0 * Math.PI * (f * 3.0) * t);
                    // 3.5x boost with hard clipping creates maximum acoustic penetration / 500% perceived loudness
                    double boosted = Math.max(-1.0, Math.min(1.0, s * 3.5));
                    buffer[i] = (short) (boosted * 32760);
                } else {
                    buffer[i] = 0;
                }
            }

            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            AudioFormat format = new AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build();
            synthTrack = new AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(format)
                .setBufferSizeInBytes(buffer.length * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build();
            synthTrack.write(buffer, 0, buffer.length);
            synthTrack.setLoopPoints(0, buffer.length, -1);
            synthTrack.setVolume(1.0f);
            synthTrack.play();
        } catch (Exception ignored) { }
    }

    public static synchronized void stopAlarm() {
        if (!isRinging && activeRingtone == null && synthTrack == null) return;
        isRinging = false;
        main.removeCallbacks(autoStop);

        // Stop synth track
        if (synthTrack != null) {
            try {
                if (synthTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                    synthTrack.stop();
                }
                synthTrack.release();
            } catch (Exception ignored) { }
            synthTrack = null;
        }

        // Stop system ringtone
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
            }
        } catch (Exception ignored) { }
        activeRingtone = null;

        // Release wake lock
        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) wakeLock.release();
            } catch (Exception ignored) { }
            wakeLock = null;
        }
    }

    public static synchronized void stopAlarm(Context context) {
        stopAlarmWithContext(context);
    }

    public static synchronized void stopAlarmWithContext(Context context) {
        stopAlarm();
        try {
            Vibrator vibrator = getVibrator(context);
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) { }
    }

    public static synchronized boolean isAlarmRinging() {
        return isRinging;
    }

    private static Vibrator getVibrator(Context context) {
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        } else {
            return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }
}
