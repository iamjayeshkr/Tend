package app.tend;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

public final class TendTimerWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, TendTimerWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(cn);
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                updateAppWidget(context, mgr, id);
            }
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_timer);

        // Click on widget body -> Open Tend
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(context, 3001, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_timer_open_app, openAppPending);
        views.setOnClickPendingIntent(R.id.widget_timer_running_click, openAppPending);

        // Read timer from StateStore
        StateStore store = new StateStore(context);
        JSONObject timer = null;

        try {
            String raw = store.load();
            if (raw != null) {
                JSONObject snapshot = new JSONObject(raw);
                timer = snapshot.optJSONObject("timer");
            }
        } catch (Exception ignored) { }
        finally {
            store.close();
        }

        boolean hasActiveTimer = timer != null && !timer.isNull("startedAt") && timer.optLong("startedAt", 0) > 0;

        if (!hasActiveTimer) {
            // IDLE STATE
            views.setViewVisibility(R.id.widget_timer_idle_container, View.VISIBLE);
            views.setViewVisibility(R.id.widget_timer_running_container, View.GONE);

            // Preset 25m
            Intent start25 = new Intent(context, WidgetActionReceiver.class)
                .setAction(WidgetActionReceiver.ACTION_START_TIMER)
                .putExtra("durationMinutes", 25)
                .putExtra("title", "Focus Session");
            PendingIntent pending25 = PendingIntent.getBroadcast(context, 3025, start25, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_btn_start_25, pending25);

            // Preset 45m
            Intent start45 = new Intent(context, WidgetActionReceiver.class)
                .setAction(WidgetActionReceiver.ACTION_START_TIMER)
                .putExtra("durationMinutes", 45)
                .putExtra("title", "Deep Work");
            PendingIntent pending45 = PendingIntent.getBroadcast(context, 3045, start45, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_btn_start_45, pending45);

            // Preset 60m
            Intent start60 = new Intent(context, WidgetActionReceiver.class)
                .setAction(WidgetActionReceiver.ACTION_START_TIMER)
                .putExtra("durationMinutes", 60)
                .putExtra("title", "Long Focus");
            PendingIntent pending60 = PendingIntent.getBroadcast(context, 3060, start60, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_btn_start_60, pending60);

        } else {
            // RUNNING STATE
            views.setViewVisibility(R.id.widget_timer_idle_container, View.GONE);
            views.setViewVisibility(R.id.widget_timer_running_container, View.VISIBLE);

            String title = timer.optString("title", "Focus Session");
            long startedAt = timer.optLong("startedAt", 0);
            int durationMinutes = timer.optInt("durationMinutes", 25);
            long pausedMs = timer.optLong("pausedMs", 0);
            boolean isPaused = !timer.isNull("pausedAt");
            long now = System.currentTimeMillis();

            long endMs = startedAt + (durationMinutes * 60000L) + pausedMs;
            long remainingMin = Math.max(0, (endMs - now + 59999) / 60000);

            views.setTextViewText(R.id.widget_timer_running_title, title);

            if (isPaused) {
                views.setTextViewText(R.id.widget_timer_status, "⏸ PAUSED");
                views.setTextViewText(R.id.widget_btn_pause_resume, "▶ Resume");
                views.setTextViewText(R.id.widget_timer_remaining, remainingMin + "m remaining (paused)");
            } else {
                views.setTextViewText(R.id.widget_timer_status, "🎯 FOCUS SESSION");
                views.setTextViewText(R.id.widget_btn_pause_resume, "⏸ Pause");
                views.setTextViewText(R.id.widget_timer_remaining, remainingMin + "m remaining");
            }

            // Pause / Resume PendingIntent
            Intent pauseResume = new Intent(context, WidgetActionReceiver.class)
                .setAction(WidgetActionReceiver.ACTION_PAUSE_RESUME_TIMER);
            PendingIntent pendingPauseResume = PendingIntent.getBroadcast(context, 3100, pauseResume, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_btn_pause_resume, pendingPauseResume);

            // Finish PendingIntent
            Intent finishTimer = new Intent(context, WidgetActionReceiver.class)
                .setAction(WidgetActionReceiver.ACTION_FINISH_TIMER);
            PendingIntent pendingFinish = PendingIntent.getBroadcast(context, 3200, finishTimer, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_btn_finish, pendingFinish);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
