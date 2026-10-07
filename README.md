# Financial Monitoring — Android 1.0.0

Offline Android edition of the Financial Monitoring app.

## What is included

- **Overview**
  - Tracked money available
  - Unpaid bills / expenses
  - Money owed to you
  - Monthly salary, freelance, repayments, spending, and net
  - Yearly totals and January–December breakdown
- **Payday Dashboard**
  - Actual payday date (not hard-coded to the 15th/30th)
  - Net pay
  - Unlimited bills / expenses
  - Due dates
  - Amount paid remains editable even after an expense is fully paid
  - Full / partial / unpaid status and remaining amount
  - Edit / delete salary cards
- **Freelance Dashboard**
  - Date received, project, client, amount received
  - Unlimited expenses with due dates and editable payments
  - Edit / delete freelance cards
- **Money Owed to Me**
  - Person/source, amount owed, date owed, due date, description
  - Partial repayments and fully-paid status
  - Repayment corrections are allowed
- **History**
  - Create, edit, payment changes, and delete events with timestamps
  - Deleted records leave a snapshot in History
- **Offline local database**
  - SQLite (`financial_monitoring.db`) inside the app's private phone storage
  - No Internet permission
  - Android cloud backup is disabled in this build

## Important accounting behavior

The app separates actual cash from pending obligations:

- Salary and freelance money count when their recorded received/payday date occurs.
- Expense payments affect tracked cash only when you enter/save an amount paid.
- Money owed to you is not treated as available cash until you record a repayment.
- Payment corrections are reversible. A fully paid bill can be changed back to partial or zero.

For monthly/yearly cash-flow monitoring, payment changes are timestamped as local cash movements. This avoids assigning every payment to the salary-card month just because the expense belongs to that card.

## Android project

- Package: `com.financialmonitoring.app`
- Version: `1.0.0` (`versionCode 2`)
- Min Android: API 24 (Android 7.0)
- Target / compile SDK: API 35
- Android Gradle Plugin: 8.7.3
- Gradle: 8.9
- Database version: 2

## Build with Android Studio

Open this folder in Android Studio, let Gradle sync, then use:

**Build → Build App Bundle(s) / APK(s) → Build APK(s)**

The debug APK will be created under:

`app/build/outputs/apk/debug/app-debug.apk`

## Build with GitHub Actions

The included `.github/workflows/build-apk.yml` installs the required Android SDK packages, runs lint, builds the debug APK, and uploads it as a workflow artifact.

## Data safety during the trial

Uninstalling the app removes its local database. Until a backup/restore feature is added, do not uninstall the trial app if it contains records you want to keep.
