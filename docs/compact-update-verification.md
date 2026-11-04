# Compact update verification

The user requested a small own-app notepad with Notes, Reminders and Calendar modes, smaller settings and fox, mandatory automatic joke bubbles, less wandering with varied slow paces, and a shortcut entrance.

The notepad is520x600 and fox settings400x590 logical pixels. The fox control is80px, with12–24px/s random-direction strolls,3½–7s rests and4–8s walks. Windows reserves Ctrl+Alt+Delete, so the entrance uses the existing Ctrl+Alt+P shortcut and respects reduced motion. Native geometry uses actual Windows rounded bounds.

Google Desktop OAuth uses PKCE, random state and a loopback callback. Credential registration and tokens use Electron safeStorage. Only opted-in reminders are sent; ordinary notes stay local. A persisted outbox retries pending changes and deterministic event IDs prevent duplicate creates. New authorization resets account-specific link state; queued items recheck current opt-in before uploading. Both review findings were reproduced with failing tests before fixes. Notification and export settings remain available in the full research tools.

No live Google connection is claimed. No Desktop client registration has been supplied. Computer Use stopped the browser setup because it could not reliably determine the current URL. The remaining account registration/import/consent handoff is documented in [Google setup](google-calendar-setup.md).

All 40 backend tests and 19 desktop journeys pass against the packaged0.3 executable. The archive’s4,739 files pass SHA-256 integrity verification. Compact windows and fictional screenshots were inspected in isolated app tests. The updated executable was launched normally on this computer and remains running; browser automation stayed stopped.

Installer: `release-pip-notepad/Research Buddy Setup0.3.0.exe`,128,192,085 bytes. Local SHA-256: `D8F542F7DA750D1E3CBAB40C623474A9842686B800997DD38971AC8F3183FED0`.

Test-only cursor input is held outside Pip during the accelerated inactivity journey, then restored before the real pointer wake-up. This avoids incidental real desktop hover correctly waking Pip during the simulated two-minute wait.
