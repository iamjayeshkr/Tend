package app.tend;

import android.app.AppOpsManager;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Process;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;

final class UsageMonitor {
    static final int JOB_ID = 701;
    private static final String[] PACKAGES = {"com.instagram.android","com.google.android.youtube","com.spotify.music","com.android.chrome"};
    private static final String[] NAMES = {"Instagram","YouTube","Spotify","Chrome"};
    static boolean hasAccess(Context context) {
        AppOpsManager manager = context.getSystemService(AppOpsManager.class);
        return manager.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,Process.myUid(),context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }
    static Map<String,Long> getTodayUsageMillis(Context context) {
        Map<String,Long> millis = new HashMap<>();
        if (!hasAccess(context)) return millis;
        try {
            long now = System.currentTimeMillis();
            Calendar day = Calendar.getInstance(); day.set(Calendar.HOUR_OF_DAY,0); day.set(Calendar.MINUTE,0); day.set(Calendar.SECOND,0); day.set(Calendar.MILLISECOND,0);
            long midnight = day.getTimeInMillis();
            UsageStatsManager manager = context.getSystemService(UsageStatsManager.class);
            UsageEvents events = manager.queryEvents(midnight - 86400000L,now);
            if (events == null) return millis;
            String foreground = null; long start = midnight;
            UsageEvents.Event event = new UsageEvents.Event();
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                int type = event.getEventType();
                long at = Math.min(now,event.getTimeStamp());
                if (type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    if (foreground != null) add(millis,foreground,Math.max(0,at - Math.max(start,midnight)));
                    foreground = event.getPackageName(); start = at;
                } else if ((type == UsageEvents.Event.MOVE_TO_BACKGROUND && event.getPackageName().equals(foreground))
                        || type == UsageEvents.Event.SCREEN_NON_INTERACTIVE || type == UsageEvents.Event.DEVICE_SHUTDOWN) {
                    if (foreground != null) add(millis,foreground,Math.max(0,at - Math.max(start,midnight)));
                    foreground = null;
                }
            }
            if (foreground != null) add(millis,foreground,Math.max(0,now - Math.max(start,midnight)));
        } catch (Exception ignored) { }
        return millis;
    }
    static double getUsageMinutesToday(Context context, String packageName) {
        if (packageName == null) return 0;
        Map<String,Long> map = getTodayUsageMillis(context);
        Long used = map.get(packageName);
        return used == null ? 0 : Math.floor(used / 6000.0) / 10.0;
    }
    static JSONObject today(Context context) {
        JSONObject result = new JSONObject();
        try {
            boolean granted = hasAccess(context);
            result.put("granted",granted); result.put("apps",new JSONArray());
            if (!granted) return result;
            long now = System.currentTimeMillis();
            Map<String,Long> millis = getTodayUsageMillis(context);
            JSONArray apps = new JSONArray();
            java.util.LinkedHashSet<String> pkgs = new java.util.LinkedHashSet<>();
            for (String p : PACKAGES) pkgs.add(p);
            try {
                JSONObject config = ProtectionStore.config(context);
                JSONArray configured = ProtectionStore.packages(config);
                for (int i = 0; i < configured.length(); i++) pkgs.add(configured.getString(i));
            } catch (Exception ignored) { }
            for (String pkg : pkgs) {
                long used = millis.containsKey(pkg) ? millis.get(pkg) : 0L;
                apps.put(new JSONObject().put("packageName",pkg).put("name",ProtectionStore.name(context,pkg)).put("minutes",Math.floor(used / 6000.0) / 10.0));
            }
            result.put("apps",apps).put("available",true).put("updatedAt",now);
        } catch (Exception e) {
            try { result.put("available",false); } catch (Exception ignored) { }
        }
        return result;
    }
    private static void add(Map<String,Long> totals,String name,long elapsed) {
        if (elapsed <= 0 || name == null || ProtectionStore.isExempt(name)) return;
        totals.put(name,totals.getOrDefault(name,0L) + elapsed);
    }
    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        boolean enabled = false;
        try { enabled = new JSONObject(context.getSharedPreferences("native",Context.MODE_PRIVATE).getString("limits","{}")).optBoolean("enabled",false); }
        catch (Exception ignored) { }
        if (!enabled) { scheduler.cancel(JOB_ID); return; }
        if (scheduler.getPendingJob(JOB_ID) != null) return;
        scheduler.schedule(new JobInfo.Builder(JOB_ID,new ComponentName(context,UsageJobService.class))
            .setPeriodic(15 * 60 * 1000L).setPersisted(true).build());
    }
    static void checkLimits(Context context) {
        if (!hasAccess(context) || !Notifications.allowed(context)) return;
        SharedPreferences prefs = context.getSharedPreferences("native",Context.MODE_PRIVATE);
        try {
            JSONObject limits = new JSONObject(prefs.getString("limits","{}"));
            if (!limits.optBoolean("enabled",false)) return;
            JSONArray apps = today(context).getJSONArray("apps");
            Calendar day = Calendar.getInstance();
            String date = day.get(Calendar.YEAR) + "-" + day.get(Calendar.DAY_OF_YEAR);
            for (int i = 0; i < Math.min(2,apps.length()); i++) {
                JSONObject app = apps.getJSONObject(i);
                double used = app.getDouble("minutes");
                int limit = limits.optInt(i == 0 ? "instagram" : "youtube",30);
                int level = used >= limit ? 2 : used >= Math.max(1,limit - 5) ? 1 : 0;
                String key = "warn-" + i;
                String previousDate = prefs.getString("warn-date","");
                int previous = date.equals(previousDate) ? prefs.getInt(key,0) : 0;
                if (level <= previous || level == 0) continue;
                String name = app.getString("name");
                String title = level == 2 ? name + " has reached your daily budget" : name + ": a few minutes left";
                String body = Math.round(used) + " of " + limit + " minutes used today. Take a breath and choose what comes next. Turn on protection in Tend to pause selected apps at your budget.";
                Notifications.show(context,Notifications.LIMITS,key,title,body);
                if (!date.equals(previousDate)) prefs.edit().putInt("warn-0",0).putInt("warn-1",0).commit();
                prefs.edit().putString("warn-date",date).putInt(key,level).commit();
            }
        } catch (Exception ignored) { }
    }
}
