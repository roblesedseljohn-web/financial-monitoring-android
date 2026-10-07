package com.financialmonitoring.app;

import android.webkit.JavascriptInterface;

public class FinanceBridge {
    private final FinanceDatabase db;

    FinanceBridge(FinanceDatabase db) {
        this.db = db;
    }

    @JavascriptInterface public String getSnapshot() { return db.getSnapshot(); }
    @JavascriptInterface public long createPaycard(String json) { return db.createPaycard(json); }
    @JavascriptInterface public boolean updatePaycard(long id, String json) { return db.updatePaycard(id, json); }
    @JavascriptInterface public boolean deletePaycard(long id) { return db.deletePaycard(id); }
    @JavascriptInterface public boolean updateExpensePayment(long id, double amount) { return db.updateExpensePayment(id, amount); }

    @JavascriptInterface public long createFreelance(String json) { return db.createFreelance(json); }
    @JavascriptInterface public boolean updateFreelance(long id, String json) { return db.updateFreelance(id, json); }
    @JavascriptInterface public boolean deleteFreelance(long id) { return db.deleteFreelance(id); }
    @JavascriptInterface public boolean updateFreelanceExpensePayment(long id, double amount) { return db.updateFreelanceExpensePayment(id, amount); }

    @JavascriptInterface public long createReceivable(String json) { return db.createReceivable(json); }
    @JavascriptInterface public boolean updateReceivable(long id, String json) { return db.updateReceivable(id, json); }
    @JavascriptInterface public boolean deleteReceivable(long id) { return db.deleteReceivable(id); }
}
