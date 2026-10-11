package com.financialmonitoring.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "finance_reminders";
    private static final int PAYDAY_NOTIFICATION_ID = 8101;
    private static final int DUE_NOTIFICATION_ID = 8102;
    private static final String PREFS = "finance_notification_state";

    @Override
    public void onReceive(Context context, Intent intent) {
        checkAndNotify(context);
    }

    public static void checkAndNotify(Context context) {
        if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        createChannel(context);

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        FinanceDatabase db = new FinanceDatabase(context);
        try {
            JSONObject snapshot = new JSONObject(db.getSnapshot());
            handlePayday(context, snapshot.optJSONArray("paycards"), today);
            handleDueExpenses(context, snapshot, today);
        } catch (Exception ignored) {
        } finally {
            db.close();
        }
    }

    private static void handlePayday(Context context, JSONArray paycards, String today) {
        int count = 0;
        double total = 0;
        if (paycards != null) {
            for (int i = 0; i < paycards.length(); i++) {
                JSONObject card = paycards.optJSONObject(i);
                if (card == null || !today.equals(card.optString("paydayDate"))) continue;
                count++;
                total += card.optDouble("netPay", 0);
            }
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (count == 0) {
            manager.cancel(PAYDAY_NOTIFICATION_ID);
            return;
        }

        String body = count == 1
                ? "Today is payday. " + money(total) + " net pay is scheduled for today."
                : "You have " + count + " payday entries today totaling " + money(total) + ".";

        String signature = today + "|" + count + "|" + total;
        if (alreadySent(context, "payday", signature)) return;

        notify(context, PAYDAY_NOTIFICATION_ID, "Payday today", body);
        remember(context, "payday", signature);
    }

    private static void handleDueExpenses(Context context, JSONObject snapshot, String today) {
        List<String> names = new ArrayList<>();
        double remainingTotal = 0;

        JSONArray paycards = snapshot.optJSONArray("paycards");
        if (paycards != null) {
            for (int i = 0; i < paycards.length(); i++) {
                JSONObject card = paycards.optJSONObject(i);
                if (card == null) continue;
                JSONArray expenses = card.optJSONArray("expenses");
                if (expenses == null) continue;
                for (int j = 0; j < expenses.length(); j++) {
                    JSONObject expense = expenses.optJSONObject(j);
                    if (expense == null || !today.equals(expense.optString("dueDate"))) continue;
                    double remaining = Math.max(expense.optDouble("amountDue", 0) - expense.optDouble("amountPaid", 0), 0);
                    if (remaining <= 0) continue;
                    names.add(expense.optString("name", "Bill") + " (" + money(remaining) + ")");
                    remainingTotal += remaining;
                }
            }
        }

        JSONArray freelance = snapshot.optJSONArray("freelance");
        if (freelance != null) {
            for (int i = 0; i < freelance.length(); i++) {
                JSONObject card = freelance.optJSONObject(i);
                if (card == null) continue;
                JSONArray expenses = card.optJSONArray("expenses");
                if (expenses == null) continue;
                for (int j = 0; j < expenses.length(); j++) {
                    JSONObject expense = expenses.optJSONObject(j);
                    if (expense == null || !today.equals(expense.optString("dueDate"))) continue;
                    double remaining = Math.max(expense.optDouble("amountDue", 0) - expense.optDouble("amountPaid", 0), 0);
                    if (remaining <= 0) continue;
                    names.add(expense.optString("name", "Expense") + " (" + money(remaining) + ")");
                    remainingTotal += remaining;
                }
            }
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (names.isEmpty()) {
            manager.cancel(DUE_NOTIFICATION_ID);
            return;
        }

        StringBuilder detail = new StringBuilder();
        int visible = Math.min(names.size(), 3);
        for (int i = 0; i < visible; i++) {
            if (i > 0) detail.append(" • ");
            detail.append(names.get(i));
        }
        if (names.size() > visible) {
            detail.append(" • +").append(names.size() - visible).append(" more");
        }

        String title = names.size() == 1 ? "Bill / expense due today" : names.size() + " bills / expenses due today";
        String body = detail + ". Total remaining: " + money(remainingTotal);
        String signature = today + "|" + names.toString() + "|" + remainingTotal;

        if (alreadySent(context, "due", signature)) return;

        notify(context, DUE_NOTIFICATION_ID, title, body);
        remember(context, "due", signature);
    }

    private static void notify(Context context, int id, String title, String body) {
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                id,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
        }

        Notification notification = builder
                .setSmallIcon(R.drawable.ic_financial_monitoring)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .build();

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(id, notification);
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Finance reminders",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Payday and bill due-date reminders");
        manager.createNotificationChannel(channel);
    }

    private static boolean alreadySent(Context context, String key, String signature) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return signature.equals(prefs.getString(key, ""));
    }

    private static void remember(Context context, String key, String signature) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(key, signature)
                .apply();
    }

    private static String money(double value) {
        return String.format(Locale.US, "₱%,.2f", Math.max(0, value));
    }
}
