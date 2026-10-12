package app.tend;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        if (!"app.tend.ALARM".equals(intent.getAction())) return;
        AlarmScheduler.fired(context,intent.getStringExtra("id"),intent.getBooleanExtra("timer",false),intent.getStringExtra("label"));
    }
}
