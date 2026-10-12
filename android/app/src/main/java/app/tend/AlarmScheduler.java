package app.tend;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.Iterator;

final class AlarmScheduler {
    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("native",Context.MODE_PRIVATE); }
    static boolean hasExactAccess(Context context) {
        return Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }
    static synchronized boolean saveDaily(Context context,String id,String time,String label) {
        if (id == null || id.isEmpty() || id.length() > 160 || time == null || !time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) return false;
        try {
            JSONObject alarms = new JSONObject(prefs(context).getString("alarms","{}"));
            JSONObject alarm = new JSONObject().put("id",id).put("time",time).put("label",safeLabel(label));
            alarms.put(id,alarm);
            if (!prefs(context).edit().putString("alarms",alarms.toString()).commit()) return false;
            scheduleDaily(context,alarm);
            return true;
        } catch (Exception e) { return false; }
    }
    private static String safeLabel(String label) { return label == null || label.trim().isEmpty() ? "A little time for you" : label.substring(0,Math.min(label.length(),160)); }
    static synchronized void cancel(Context context,String id) {
        if (id == null) return;
        try {
            context.getSystemService(AlarmManager.class).cancel(pending(context,id,false,""));
            JSONObject alarms = new JSONObject(prefs(context).getString("alarms","{}"));
            alarms.remove(id); prefs(context).edit().putString("alarms",alarms.toString()).commit();
        } catch (Exception ignored) { }
    }
    static void scheduleDaily(Context context,JSONObject alarm) {
        String[] clock = alarm.optString("time").split(":");
        if (clock.length != 2) return;
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY,Integer.parseInt(clock[0])); next.set(Calendar.MINUTE,Integer.parseInt(clock[1]));
        next.set(Calendar.SECOND,0); next.set(Calendar.MILLISECOND,0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DATE,1);
        schedule(context,next.getTimeInMillis(),pending(context,alarm.optString("id"),false,alarm.optString("label")));
    }
    static void schedule(Context context,long at,PendingIntent pending) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        try {
            if (hasExactAccess(context)) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);
            else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);
        } catch (SecurityException e) { manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending); }
    }
    private static PendingIntent pending(Context context,String id,boolean timer,String label) {
        Intent intent = new Intent(context,AlarmReceiver.class).setAction("app.tend.ALARM")
            .setData(Uri.parse("tend://" + (timer ? "timer/" : "alarm/") + Uri.encode(id)))
            .putExtra("id",id).putExtra("timer",timer).putExtra("label",label);
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static synchronized void timer(Context context,long endMs,String title) {
        if (endMs <= System.currentTimeMillis() || endMs > System.currentTimeMillis() + 86400000L) return;
        prefs(context).edit().putLong("timerEnd",endMs).putString("timerTitle",safeLabel(title)).commit();
        ProtectionStore.syncFocus(context, endMs);
        schedule(context,endMs,pending(context,"focus",true,safeLabel(title)));
    }
    static void cancelTimer(Context context) {
        context.getSystemService(AlarmManager.class).cancel(pending(context,"focus",true,""));
        prefs(context).edit().remove("timerEnd").remove("timerTitle").commit();
        ProtectionStore.syncFocus(context, 0);
    }
    static synchronized void scheduleLogDeadline(Context context) {
        JSONObject config = ProtectionStore.config(context);
        if (!config.optBoolean("enabled", false) || !config.optBoolean("lockOnMissedLog", true)) return;
        String deadline = config.optString("logDeadline", "20:30");
        String[] clock = deadline.split(":");
        if (clock.length != 2) return;
        Calendar next = Calendar.getInstance();
        try {
            next.set(Calendar.HOUR_OF_DAY, Integer.parseInt(clock[0]));
            next.set(Calendar.MINUTE, Integer.parseInt(clock[1]));
            next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
            if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DATE, 1);
            PendingIntent alarmIntent = pending(context, "log-deadline", false, "Log your daily entry");
            AlarmManager manager = context.getSystemService(AlarmManager.class);
            if (hasExactAccess(context)) {
                Intent showIntent = new Intent(context, MainActivity.class).setAction("app.tend.ACTION_MANDATORY_LOG");
                PendingIntent showPending = PendingIntent.getActivity(context, 888, showIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                manager.setAlarmClock(new AlarmManager.AlarmClockInfo(next.getTimeInMillis(), showPending), alarmIntent);
            } else {
                schedule(context, next.getTimeInMillis(), alarmIntent);
            }
        } catch (Exception ignored) { }
    }
    static synchronized void restore(Context context) {
        try {
            JSONObject alarms = new JSONObject(prefs(context).getString("alarms","{}"));
            for (Iterator<String> keys = alarms.keys(); keys.hasNext();) scheduleDaily(context,alarms.getJSONObject(keys.next()));
            long timerEnd = prefs(context).getLong("timerEnd",0);
            if (timerEnd > System.currentTimeMillis()) timer(context,timerEnd,prefs(context).getString("timerTitle","Your focus session"));
            else if (timerEnd > 0) {
                if (System.currentTimeMillis() - timerEnd < 3600000) Notifications.show(context,Notifications.FOCUS,"focus-finished","Your focus timer has finished","Open Tend to wrap up and record your session.");
                cancelTimer(context);
            }
            scheduleLogDeadline(context);
        } catch (Exception ignored) { }
    }
    static synchronized void fired(Context context,String id,boolean timer,String label) {
        if (timer) {
            Notifications.show(context,Notifications.FOCUS,"focus-finished",label,"Time to take a breath. Open Tend to finish and record your session.");
            prefs(context).edit().remove("timerEnd").remove("timerTitle").commit();
            ProtectionStore.syncFocus(context, 0);
        } else if ("log-deadline".equals(id)) {
            String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
            if (!ProtectionStore.isDailyLogDone(context, today)) {
                ProtectionStore.setMandatoryLogPending(context, true);
                JSONObject config = ProtectionStore.config(context);
                boolean soundAlarm = config.optBoolean("alarmSoundOnMissedLog", true);
                if (soundAlarm) {
                    AlarmRinger.startAlarm(context);
                }
                Notifications.show(context, Notifications.ALARMS, "log-deadline", "⏰ Daily entry deadline completed", "Scheduled time completed, but you have not logged your daily tasks! Open Tend to complete your entry.");
                try {
                    Intent intent = new Intent(context, MainActivity.class)
                        .setAction("app.tend.ACTION_MANDATORY_LOG")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    context.startActivity(intent);
                } catch (Exception ignored) { }
            }
            scheduleLogDeadline(context);
        } else {
            if ("wake".equals(id)) {
                ProtectionStore.onWakeAlarmFired(context);
            }
            AlarmRinger.startAlarm(context);
            try {
                JSONObject alarms = new JSONObject(prefs(context).getString("alarms","{}"));
                if (!alarms.has(id)) return;
                Notifications.show(context,Notifications.ALARMS,"alarm-" + id,label,"⏰ Alarm ringing! Open Tend to wake up and start your day.");
                scheduleDaily(context,alarms.getJSONObject(id));
            } catch (Exception ignored) { }
            try {
                Intent alarmIntent = new Intent(context, MainActivity.class)
                    .setAction("app.tend.ACTION_ALARM_RINGING")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                context.startActivity(alarmIntent);
            } catch (Exception ignored) { }
        }
    }
}
