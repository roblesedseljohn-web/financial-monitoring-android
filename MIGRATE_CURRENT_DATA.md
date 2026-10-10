# Preserve current phone data before the one-time signing migration

Use this only when moving from the old randomly debug-signed APK to the new permanently signed APK.

Because the old app is a debug build, ADB can copy its private SQLite database to your PC before uninstalling it.

## Before uninstalling the old app

1. Enable **Developer options → USB debugging** on the phone.
2. Install Android Platform Tools on the PC and connect the phone by USB.
3. Approve the USB debugging prompt on the phone.
4. Close Financial Monitoring, then run:

```text
adb shell am force-stop com.financialmonitoring.app
adb exec-out run-as com.financialmonitoring.app cat databases/financial_monitoring.db > financial_monitoring.db
```

Keep `financial_monitoring.db` safe. Do not uninstall the old app until the file exists and has a non-zero size.

## Move to the permanent signed build

1. Configure the permanent signing key using `SIGNING_SETUP.md`.
2. Build and download the signed APK.
3. Uninstall the old debug-signed Financial Monitoring app.
4. Install the new signed APK.
5. Open Financial Monitoring once.
6. On the Overview screen, choose **Import Backup**.
7. Select the saved `financial_monitoring.db` file.

The app validates the SQLite backup and upgrades older database versions automatically before loading it.

## After the migration

Use **Export Backup** before major updates or phone changes. Normal future APK updates built with the same permanent signing key should install over the existing app without deleting local data.
