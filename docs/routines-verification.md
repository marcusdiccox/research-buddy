# Routines update 0.7 — November 5, 2026

Implemented daily, weekday, weekly and monthly reminders. Completing a routine advances its same ID to the next future local occurrence, resets the five warning checkpoints and preserves Google event linkage. Monthly anchors survive short-month clamping, snooze and minute-precision edits; choosing a different calendar date resets the anchor. Nonexistent DST times are skipped. Google sync moves the same event; this is not a Google recurring series.

Focus sessions last 15, 25 or 45 minutes, are session-local, settle Pip and pause casual speech while urgent reminders continue. Show/hide still works during focus; restoration skips the offscreen entrance. Quitting ends focus. Actual deadlines account for time asleep.

Natural date entry runs locally in the shared date dialog, with Preview date, Use date and Done. Unsupported, ambiguous, past and invalid/DST-local times return feedback. Examples: tomorrow at 3pm, next Friday at 09:00, in 30 minutes. Next weekdays mean the following Monday–Sunday calendar week.

190 backend tests and TypeScript/build checks passed. All 43 desktop journeys passed against the packaged executable, including all prior workflows, repeat completion, natural date confirmation, quiet focus, reminder priority during focus and focus shortcut restoration. Review identified offscreen focus restoration and monthly anchor rounding; regressions were observed failing before fixes and passing after.

The Windows installer was built with inputs frozen. All 4,747 archive files passed embedded SHA-256 integrity checks. Installer: release-pip-routines/Research Buddy Setup 0.7.0.exe. SHA-256: DFEA3F13C10CF43144E8699D2444414346F5ADDA68579C49339A3AA039263C84.

Existing saved notes/projects/journal were backed up and verified unchanged after normal launch. Test deletions and scheduling use fictional data. The app remains unsigned; separate clean-machine installation and live Google account connection are not claimed.

Windows test temporary-directory cleanup now retries transient EPERM file locks after confirmed app shutdown; behavior failures remain failures. Additional automatic backup/restore remains a future idea.
