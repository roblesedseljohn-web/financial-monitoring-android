# Financial Monitoring — Android 1.4.0

Offline-first Android edition of the Financial Monitoring app.

## Main sections

- **Overview**
  - Tracked money available
  - Unpaid bills / expenses
  - Money owed to you
  - Monthly and yearly salary, freelance income, repayments, actual spending, and net cash flow
  - Future Payday cards do not count as received money until their payday date arrives
  - Local database Export Backup / Import Backup controls
- **Payday**
  - Actual payday date
  - Net pay
  - Permanent allowance field
  - Unlimited bills / expenses
  - Editable full / partial / zero payments
  - Money left based on actual payments
  - Possible money left after all listed bills are fully paid
- **Freelance**
  - Date received, project, client, and amount received
  - Unlimited expenses
  - Money left based on actual spending
  - Possible money left after all listed expenses are fully paid
- **General Expenses**
  - Spending from accumulated available money that is not tied to a specific Payday or Freelance card
  - Date, name, amount, optional description
  - Counts as actual spending on the selected expense date
  - Reduces Tracked money available
  - Edit and delete support with History records
- **Money Owed to Me**
  - Partial and full repayments
  - Repayments count as cash-in only when actually received
- **History**
  - Created, edited, payment, and deleted events with timestamps

## Accounting behavior

The app separates actual cash from planned obligations:

- Future salary is excluded from Overview until the Payday date arrives.
- Payday and Freelance listed bills can be unpaid while still contributing to Possible money left.
- Actual payments reduce tracked cash when they are recorded.
- General Expenses are treated as immediate actual spending from the accumulated balance.
- Money owed to you does not count as available money until repayment is recorded.

## Local data

- SQLite database: `financial_monitoring.db`
- Stored inside the app's private phone storage
- No Internet permission
- Android cloud backup remains disabled
- Version 1.4.0 adds manual **Export Backup** and **Import Backup**

## Android project

- Package: `com.financialmonitoring.app`
- Version: `1.4.0` (`versionCode 6`)
- Min Android: API 24
- Target / compile SDK: API 35
- Gradle: 8.9
- Database version: 4

## GitHub Actions

Two workflows are included:

- **Build Financial Monitoring APK** — normal debug build for development/testing
- **Build Signed Financial Monitoring APK** — manual permanent-signing build for installable updates

For long-term phone use, configure the permanent signing workflow using `SIGNING_SETUP.md`. Do not commit the keystore or signing passwords to the repository.

## Moving from the old debug-signed app

Older GitHub debug builds may conflict because each clean runner can use a different temporary debug signing key.

Use `MIGRATE_CURRENT_DATA.md` before the one-time uninstall/reinstall into the permanent signed build so the current SQLite records can be preserved.
