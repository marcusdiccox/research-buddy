# Automatic notebook backups

The user delegated choosing and committing a useful design or backend update. This small backend change protects the local notebook without adding setup or controls.

## Approach

Manual JSON export already exists but needs user action and is incomplete as a database recovery mechanism. Copying a live SQLite file can miss WAL contents. My implementation choice is a SQLite `VACUUM INTO` snapshot, verified with `quick_check`, then atomically renamed into the profile's `backups` directory.

Create at startup and check every 30 minutes while running, at most once per UTC date. Keep the current snapshot and the six latest other managed daily snapshots. Retention runs only after publishing a verified new snapshot. Never overwrite an existing daily snapshot, prune unrelated files, or let a backup error prevent opening the app. Temporary files are unique and cleaned on failure.

Back up the whole notebook database, including notes, reminders, revisions, groups, settings and sync metadata. Google credentials are stored separately and are not copied. Keep all snapshots on this computer. This does not protect against loss of the disk; restore UI and cloud backup are outside this change. Use the existing TypeScript/Electron/SQLite stack without dependencies.

## Checks

Real temporary databases must prove live WAL content is included, original data remains writable, saved snapshots reopen with search and settings intact, same-day snapshots stay unchanged, a new day creates a new snapshot, retention stays bounded and preserves unrelated files, and failures keep previous snapshots. Test mode uses only temporary profiles and must exercise startup integration.
