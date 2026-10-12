package app.tend;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

final class Notifications {
    static final String ALARMS = "tend_alarms_v1", FOCUS = "tend_focus_v1", LIMITS = "tend_limits_v1";
    static void createChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel alarms = new NotificationChannel(ALARMS,"Routine alarms",NotificationManager.IMPORTANCE_HIGH);
        alarms.setDescription("The daily alarms you create in Tend");
        alarms.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        alarms.enableVibration(true);
        manager.createNotificationChannel(alarms);
        NotificationChannel focus = new NotificationChannel(FOCUS,"Focus timer",NotificationManager.IMPORTANCE_HIGH);
        focus.setDescription("A gentle alert when your focus timer ends");
        manager.createNotificationChannel(focus);
        NotificationChannel limits = new NotificationChannel(LIMITS,"Distraction reminders",NotificationManager.IMPORTANCE_DEFAULT);
        limits.setDescription("Periodic reminders when an app approaches or passes your daily budget");
        manager.createNotificationChannel(limits);
    }
    static boolean allowed(Context context) {
        return (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && context.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }
    static void show(Context context, String channel, String key, String title, String body) {
        if (!allowed(context)) return;
        createChannels(context);
        Intent open = new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context,key.hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context,channel)
            .setSmallIcon(R.drawable.ic_notification).setColor(0xFF335D43)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true)
            .setCategory(ALARMS.equals(channel) ? Notification.CATEGORY_ALARM : Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE).build();
        try { context.getSystemService(NotificationManager.class).notify(key, key.hashCode(), notification); }
        catch (SecurityException ignored) { /* Permission can be revoked between check and post. */ }
    }
}
