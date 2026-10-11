package com.financialmonitoring.app;

import android.webkit.JavascriptInterface;

public class FinanceBridge {
    private final MainActivity activity;
    private final FinanceDatabase db;

    FinanceBridge(MainActivity activity, FinanceDatabase db) {
        this.activity = activity;
        this.db = db;
    }

    @JavascriptInterface public String getSnapshot() { return db.getSnapshot(); }
    @JavascriptInterface public long createPaycard(String json) { long result = db.createPaycard(json); activity.refreshFinanceReminders(); return result; }
    @JavascriptInterface public boolean updatePaycard(long id, String json) { boolean result = db.updatePaycard(id, json); activity.refreshFinanceReminders(); return result; }
    @JavascriptInterface public boolean deletePaycard(long id) { boolean result = db.deletePaycard(id); activity.refreshFinanceReminders(); return result; }
    @JavascriptInterface public boolean updateExpensePayment(long id, double amount) { boolean result = db.updateExpensePayment(id, amount); activity.refreshFinanceReminders(); return result; }

    @JavascriptInterface public long createFreelance(String json) { long result = db.createFreelance(json); activity.refreshFinanceReminders(); return result; }
    @JavascriptInterface public boolean updateFreelance(long id, String json) { boolean result = db.updateFreelance(id, json); activity.refreshFinanceReminders(); return result; }
    @JavascriptInterface public boolean deleteFreelance(long id) { boolean result = db.deleteFreelance(id); activity.refreshFinanceReminders(); return result; }
    @JavascriptInterface public boolean updateFreelanceExpensePayment(long id, double amount) { boolean result = db.updateFreelanceExpensePayment(id, amount); activity.refreshFinanceReminders(); return result; }

    @JavascriptInterface public long createReceivable(String json) { return db.createReceivable(json); }
    @JavascriptInterface public boolean updateReceivable(long id, String json) { return db.updateReceivable(id, json); }
    @JavascriptInterface public boolean deleteReceivable(long id) { return db.deleteReceivable(id); }

    @JavascriptInterface public long createGeneralExpense(String json) { return db.createGeneralExpense(json); }
    @JavascriptInterface public boolean updateGeneralExpense(long id, String json) { return db.updateGeneralExpense(id, json); }
    @JavascriptInterface public boolean deleteGeneralExpense(long id) { return db.deleteGeneralExpense(id); }

    @JavascriptInterface public void exportDatabase() { activity.runOnUiThread(activity::exportDatabaseBackup); }
    @JavascriptInterface public void importDatabase() { activity.runOnUiThread(activity::importDatabaseBackup); }
}
