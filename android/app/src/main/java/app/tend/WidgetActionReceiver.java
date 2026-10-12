package app.tend;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;

public final class WidgetActionReceiver extends BroadcastReceiver {
    public static final String ACTION_TOGGLE_TASK = "app.tend.ACTION_WIDGET_TOGGLE_TASK";
    public static final String ACTION_START_TIMER = "app.tend.ACTION_WIDGET_START_TIMER";
    public static final String ACTION_PAUSE_RESUME_TIMER = "app.tend.ACTION_WIDGET_PAUSE_RESUME_TIMER";
    public static final String ACTION_FINISH_TIMER = "app.tend.ACTION_WIDGET_FINISH_TIMER";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        StateStore store = new StateStore(context);

        try {
            String raw = store.load();
            if (raw == null) return;
            JSONObject snapshot = new JSONObject(raw);

            if (ACTION_TOGGLE_TASK.equals(action)) {
                String taskId = intent.getStringExtra("taskId");
                if (taskId == null || taskId.isEmpty()) return;

                JSONArray tasks = snapshot.optJSONArray("tasks");
                if (tasks != null) {
                    for (int i = 0; i < tasks.length(); i++) {
                        JSONObject task = tasks.optJSONObject(i);
                        if (task != null && taskId.equals(task.optString("id"))) {
                            boolean done = task.optBoolean("done", false);
                            task.put("done", !done);
                            break;
                        }
                    }
                    store.save(snapshot.toString());
                    ProtectionStore.syncSnapshot(context, snapshot.toString());
                    TendTasksWidgetProvider.updateAll(context);
                }
            } else if (ACTION_START_TIMER.equals(action)) {
                int duration = intent.getIntExtra("durationMinutes", 25);
                String title = intent.getStringExtra("title");
                if (title == null || title.isEmpty()) title = duration == 25 ? "Focus Session" : duration == 45 ? "Deep Work" : "Long Focus";

                long now = System.currentTimeMillis();
                JSONObject timer = new JSONObject();
                timer.put("id", "timer-" + now);
                timer.put("title", title);
                timer.put("category", "work");
                timer.put("startedAt", now);
                timer.put("durationMinutes", duration);
                timer.put("pausedAt", JSONObject.NULL);
                timer.put("pausedMs", 0);

                snapshot.put("timer", timer);
                store.save(snapshot.toString());

                AlarmScheduler.timer(context, now + duration * 60000L, title);
                ProtectionStore.syncSnapshot(context, snapshot.toString());
                TendTimerWidgetProvider.updateAll(context);
            } else if (ACTION_PAUSE_RESUME_TIMER.equals(action)) {
                JSONObject timer = snapshot.optJSONObject("timer");
                if (timer != null && !timer.isNull("startedAt")) {
                    long now = System.currentTimeMillis();
                    boolean isPaused = !timer.isNull("pausedAt");

                    if (isPaused) {
                        // Resume
                        long pausedAt = timer.getLong("pausedAt");
                        long pausedMs = timer.optLong("pausedMs", 0) + (now - pausedAt);
                        timer.put("pausedMs", pausedMs);
                        timer.put("pausedAt", JSONObject.NULL);

                        long startedAt = timer.getLong("startedAt");
                        int duration = timer.getInt("durationMinutes");
                        long endMs = startedAt + duration * 60000L + pausedMs;
                        AlarmScheduler.timer(context, endMs, timer.optString("title", "Focus Session"));
                    } else {
                        // Pause
                        timer.put("pausedAt", now);
                        AlarmScheduler.cancelTimer(context);
                    }

                    snapshot.put("timer", timer);
                    store.save(snapshot.toString());
                    ProtectionStore.syncSnapshot(context, snapshot.toString());
                    TendTimerWidgetProvider.updateAll(context);
                }
            } else if (ACTION_FINISH_TIMER.equals(action)) {
                JSONObject timer = snapshot.optJSONObject("timer");
                if (timer != null && !timer.isNull("startedAt")) {
                    long now = System.currentTimeMillis();
                    long startedAt = timer.getLong("startedAt");
                    String title = timer.optString("title", "Focus Session");
                    String category = timer.optString("category", "work");

                    // Create activity record
                    JSONArray activities = snapshot.optJSONArray("activities");
                    if (activities == null) {
                        activities = new JSONArray();
                        snapshot.put("activities", activities);
                    }
                    JSONObject activity = new JSONObject();
                    activity.put("id", "act-" + now);
                    activity.put("title", title);
                    activity.put("category", category);
                    activity.put("start", startedAt);
                    activity.put("end", now);
                    activity.put("createdAt", now);
                    activity.put("modifiedAt", now);
                    activity.put("source", "timer");
                    activities.put(activity);

                    snapshot.put("timer", JSONObject.NULL);
                    store.save(snapshot.toString());

                    AlarmScheduler.cancelTimer(context);
                    ProtectionStore.syncSnapshot(context, snapshot.toString());
                    TendTimerWidgetProvider.updateAll(context);
                }
            }
        } catch (Exception ignored) { }
        finally {
            store.close();
        }
    }
}
