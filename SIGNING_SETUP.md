# Stable APK signing setup

Financial Monitoring stores its database locally on the phone. Android only allows an APK to update an installed app when both APKs use the same package name **and the same signing key**.

The earlier GitHub Actions builds used temporary debug signing keys, so a later debug APK could conflict with the version already installed.

## One-time setup

Generate one permanent signing key on your own PC and keep it private.

### 1. Create the keystore

In Command Prompt or PowerShell with Java installed:

```text
keytool -genkeypair -v -keystore financial-monitoring-release.jks -alias financial-monitoring -keyalg RSA -keysize 2048 -validity 10000
```

Choose a strong password and keep the `.jks` file somewhere backed up. Do **not** commit this file to GitHub.

### 2. Convert the keystore to Base64

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("financial-monitoring-release.jks")) | Set-Clipboard
```

### 3. Add these GitHub Actions repository secrets

Open the repository, then:

**Settings → Secrets and variables → Actions → New repository secret**

Create:

- `FM_KEYSTORE_BASE64` — paste the Base64 text from step 2
- `FM_KEYSTORE_PASSWORD` — the keystore password
- `FM_KEY_ALIAS` — `financial-monitoring` unless you chose another alias
- `FM_KEY_PASSWORD` — the key password

Never put these values in source files or commits.

### 4. Build the permanent signed APK

Open:

**Actions → Build Signed Financial Monitoring APK → Run workflow**

Install APKs from this signed workflow for all future versions. As long as the same keystore is retained, future APKs can update the installed app without uninstalling it and the local database remains in place.

## Important: current debug installation

The currently installed debug version was signed with an earlier temporary key. A new permanent signing key cannot impersonate that old key, so switching from the old debug build to the new signed build requires **one final uninstall/reinstall**.

Before that uninstall, preserve the current database. Version 1.4.0 includes **Export Backup** and **Import Backup** for future migrations, but an older installed version cannot gain that feature until it is replaced. Use the ADB migration steps in `MIGRATE_CURRENT_DATA.md` to save the existing database first.
