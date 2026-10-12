package app.tend;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.android.gms.location.SleepClassifyEvent;
import com.google.android.gms.location.SleepSegmentEvent;
import java.util.List;

public final class SleepReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        try {
            if (SleepSegmentEvent.hasEvents(intent)) {
                List<SleepSegmentEvent> events = SleepSegmentEvent.extractEvents(intent);
                if (events != null && !events.isEmpty()) {
                    WakeConfidenceEngine.getInstance(context).onSleepSegmentEvents(events);
                }
            }
            if (SleepClassifyEvent.hasEvents(intent)) {
                List<SleepClassifyEvent> events = SleepClassifyEvent.extractEvents(intent);
                if (events != null && !events.isEmpty()) {
                    WakeConfidenceEngine.getInstance(context).onSleepClassifyEvents(events);
                }
            }
        } catch (Throwable ignored) { }
    }
}
