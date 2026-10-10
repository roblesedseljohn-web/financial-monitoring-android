package com.financialmonitoring.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int REQUEST_EXPORT_DATABASE = 4101;
    private static final int REQUEST_IMPORT_DATABASE = 4102;
    private static final String DATABASE_NAME = "financial_monitoring.db";

    private WebView webView;
    private FinanceDatabase database;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        database = new FinanceDatabase(this);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(true);
        settings.setBlockNetworkLoads(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new FinanceBridge(this, database), "Android");
        webView.loadUrl("file:///android_asset/index.html");
    }

    public void exportDatabaseBackup() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        String date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        intent.putExtra(Intent.EXTRA_TITLE, "FinancialMonitoring-backup-" + date + ".db");
        startActivityForResult(intent, REQUEST_EXPORT_DATABASE);
    }

    public void importDatabaseBackup() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(intent, REQUEST_IMPORT_DATABASE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;

        Uri uri = data.getData();
        if (requestCode == REQUEST_EXPORT_DATABASE) {
            exportDatabaseTo(uri);
        } else if (requestCode == REQUEST_IMPORT_DATABASE) {
            importDatabaseFrom(uri);
        }
    }

    private void exportDatabaseTo(Uri uri) {
        try {
            database.close();
            File source = getDatabasePath(DATABASE_NAME);
            if (!source.exists()) throw new IllegalStateException("Database file does not exist");

            try (InputStream in = new FileInputStream(source);
                 OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
                if (out == null) throw new IllegalStateException("Could not open backup destination");
                copyStream(in, out);
            }
            showWebToast("Database backup exported");
        } catch (Exception e) {
            showWebToast("Backup failed");
        }
    }

    private void importDatabaseFrom(Uri uri) {
        File temp = new File(getCacheDir(), "financial_monitoring_import.db");
        File current = getDatabasePath(DATABASE_NAME);
        File rollback = new File(getCacheDir(), "financial_monitoring_previous.db");

        try {
            try (InputStream in = getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(temp, false)) {
                if (in == null) throw new IllegalStateException("Could not open selected backup");
                copyStream(in, out);
            }

            validateBackup(temp);

            database.close();
            deleteDatabaseSidecars();

            if (current.exists()) {
                copyFile(current, rollback);
            } else if (rollback.exists()) {
                rollback.delete();
            }

            copyFile(temp, current);

            try {
                database.getWritableDatabase();
            } catch (Exception openError) {
                database.close();
                deleteDatabaseSidecars();
                if (rollback.exists()) copyFile(rollback, current);
                database.getWritableDatabase();
                throw openError;
            }

            showWebToast("Backup imported successfully");
            webView.postDelayed(() -> webView.reload(), 500);
        } catch (Exception e) {
            showWebToast("Import failed: invalid or unsupported backup");
        } finally {
            if (temp.exists()) temp.delete();
            if (rollback.exists()) rollback.delete();
        }
    }

    private void validateBackup(File file) throws Exception {
        SQLiteDatabase check = SQLiteDatabase.openDatabase(file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
        try {
            try (Cursor c = check.rawQuery("PRAGMA quick_check", null)) {
                if (!c.moveToFirst() || !"ok".equalsIgnoreCase(c.getString(0))) {
                    throw new IllegalStateException("SQLite integrity check failed");
                }
            }
            try (Cursor c = check.rawQuery("PRAGMA user_version", null)) {
                if (!c.moveToFirst()) throw new IllegalStateException("Database version missing");
                int version = c.getInt(0);
                if (version < 1 || version > 4) throw new IllegalStateException("Unsupported database version");
            }
        } finally {
            check.close();
        }
    }

    private void deleteDatabaseSidecars() {
        File db = getDatabasePath(DATABASE_NAME);
        new File(db.getPath() + "-wal").delete();
        new File(db.getPath() + "-shm").delete();
        new File(db.getPath() + "-journal").delete();
    }

    private void copyFile(File source, File destination) throws Exception {
        File parent = destination.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Could not create database directory");
        }
        try (InputStream in = new FileInputStream(source);
             OutputStream out = new FileOutputStream(destination, false)) {
            copyStream(in, out);
        }
    }

    private void copyStream(InputStream in, OutputStream out) throws Exception {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        out.flush();
    }

    private void showWebToast(String message) {
        if (webView == null) return;
        String safe = message.replace("\\", "\\\\").replace("'", "\\'");
        webView.post(() -> webView.evaluateJavascript(
                "window.toast ? window.toast('" + safe + "') : void 0", null));
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "window.handleAndroidBack ? window.handleAndroidBack() : false",
                value -> {
                    if (!"true".equals(value)) {
                        MainActivity.super.onBackPressed();
                    }
                }
        );
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("Android");
            webView.destroy();
            webView = null;
        }
        if (database != null) {
            database.close();
            database = null;
        }
        super.onDestroy();
    }
}
