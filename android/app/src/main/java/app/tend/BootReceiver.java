package app.tend;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_USER_PRESENT.equals(action)) {
            ProtectionStore.onScreenOn(context, System.currentTimeMillis());
            return;
        }
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !Intent.ACTION_TIMEZONE_CHANGED.equals(action) && !Intent.ACTION_TIME_CHANGED.equals(action)
            && !android.app.AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) return;
        AlarmScheduler.restore(context);
        UsageMonitor.schedule(context);
    }
}
