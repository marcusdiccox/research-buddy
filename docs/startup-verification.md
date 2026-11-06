# Windows startup update 0.8 — November 6, 2026

The Windows NSIS installer installs a stable executable, desktop and Start menu shortcuts, and a per-user login entry on first installation. The small settings popup and advanced settings expose Start with Windows. Reading settings does not register or repair an entry. Development/unpacked builds cannot enable startup. Test mode never reads or writes real login items.

Upgrades preserve removed login entries and Windows Startup Apps opt-out state. Explicit enable/disable uses Electron's login-item API and checks the exact named, user-scoped entry, executable path, arguments and enabled state. Electron's aggregate openAtLogin flag differed from its actual named entry on this computer; a regression test covers that observed behavior. Uninstall removes only the owned command and initialization marker; upgrade uninstall leaves them intact.

Validation: TypeScript checks, 210 backend tests and all 43 desktop journeys passed against the final installed executable. These include the compact startup checkbox, recurring reminders, natural dates and quiet focus. All 4,748 archived files passed embedded SHA-256 integrity verification. The packaged startup module matches the final compiled implementation.

Installed the final installer on the development Windows computer and imported its installed startup implementation for real OS checks: enabled, disabled, reinstalled while disabled, still disabled, then explicitly enabled. Both installed shortcuts target the stable installed executable. Startup is enabled on this computer. No reboot or separate clean-machine installation test is claimed.

Launched the production app from its installed desktop shortcut and confirmed the running executable is in the stable install directory. Existing saved notes, projects and journal records match the pre-install database backup after launch. All desktop test data used separate temporary profiles.

Installer: `Research Buddy Setup 0.8.0.exe`, distributed as `Pip-Setup-0.8.0.exe`. SHA-256: `37380B6EB3FED0226AF1B028A25BDBCCE048EA0198F34016E47E8FEFE05DBE2D`.
