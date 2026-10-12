package app.tend;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public final class TendTasksWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, TendTasksWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(cn);
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                updateAppWidget(context, mgr, id);
            }
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_tasks);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());

        // Header click -> Open Tend
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(context, 1001, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_tasks_header_click, openAppPending);

        // Quick Add Task click -> Open QuickTaskActivity
        Intent quickTaskIntent = new Intent(context, QuickTaskActivity.class);
        quickTaskIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent quickTaskPending = PendingIntent.getActivity(context, 1002, quickTaskIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_btn_add_task, quickTaskPending);

        // Read tasks from StateStore
        StateStore store = new StateStore(context);
        List<JSONObject> todayTasks = new ArrayList<>();
        int pendingCount = 0;

        try {
            String raw = store.load();
            if (raw != null) {
                JSONObject snapshot = new JSONObject(raw);
                JSONArray tasks = snapshot.optJSONArray("tasks");
                if (tasks != null) {
                    for (int i = 0; i < tasks.length(); i++) {
                        JSONObject t = tasks.optJSONObject(i);
                        if (t != null) {
                            String taskDate = t.optString("date", "");
                            if (today.equals(taskDate)) {
                                todayTasks.add(t);
                                if (!t.optBoolean("done", false)) {
                                    pendingCount++;
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) { }
        finally {
            store.close();
        }

        // Set remaining count text
        if (todayTasks.isEmpty()) {
            views.setTextViewText(R.id.widget_tasks_count, "No tasks for today");
            views.setViewVisibility(R.id.widget_tasks_empty, View.VISIBLE);
        } else if (pendingCount == 0) {
            views.setTextViewText(R.id.widget_tasks_count, "All commitments done! ✨");
            views.setViewVisibility(R.id.widget_tasks_empty, View.GONE);
        } else {
            views.setTextViewText(R.id.widget_tasks_count, pendingCount + " task" + (pendingCount == 1 ? "" : "s") + " remaining");
            views.setViewVisibility(R.id.widget_tasks_empty, View.GONE);
        }

        int[] rowIds = {R.id.task_row_1, R.id.task_row_2, R.id.task_row_3, R.id.task_row_4};
        int[] checkIds = {R.id.task_check_1, R.id.task_check_2, R.id.task_check_3, R.id.task_check_4};
        int[] titleIds = {R.id.task_title_1, R.id.task_title_2, R.id.task_title_3, R.id.task_title_4};
        int[] catIds = {R.id.task_category_1, R.id.task_category_2, R.id.task_category_3, R.id.task_category_4};

        for (int i = 0; i < 4; i++) {
            if (i < todayTasks.size()) {
                JSONObject task = todayTasks.get(i);
                String taskId = task.optString("id");
                String title = task.optString("title", "Task");
                String category = task.optString("category", "work");
                boolean done = task.optBoolean("done", false);

                views.setViewVisibility(rowIds[i], View.VISIBLE);
                views.setTextViewText(titleIds[i], title);
                views.setTextViewText(catIds[i], category);

                if (done) {
                    views.setImageViewResource(checkIds[i], R.drawable.ic_check_circle_filled);
                    views.setTextColor(titleIds[i], Color.parseColor("#8A9988"));
                } else {
                    views.setImageViewResource(checkIds[i], R.drawable.ic_check_circle_empty);
                    views.setTextColor(titleIds[i], Color.parseColor("#264B38"));
                }

                // Check click -> toggle task done
                Intent toggleIntent = new Intent(context, WidgetActionReceiver.class);
                toggleIntent.setAction(WidgetActionReceiver.ACTION_TOGGLE_TASK);
                toggleIntent.putExtra("taskId", taskId);
                PendingIntent togglePending = PendingIntent.getBroadcast(
                    context,
                    2000 + i + (appWidgetId * 10),
                    toggleIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                views.setOnClickPendingIntent(checkIds[i], togglePending);
                views.setOnClickPendingIntent(titleIds[i], togglePending);
            } else {
                views.setViewVisibility(rowIds[i], View.GONE);
            }
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
