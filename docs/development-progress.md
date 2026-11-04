# Research Buddy development ledger

Plan: `docs/superpowers/plans/2026-11-03-research-buddy.md`.

The user authorized implementation after planning and added cute, approachable design, working reminders, and Google Calendar event creation. Work is in the fresh task directory on a feature branch; there is no existing application to isolate or migrate.

## Scope updates and decisions

- Reminders enter v0.1: persistent local due dates, desktop notifications while running, overdue recovery on launch, snooze, complete/reopen.
- Google Calendar initially uses Google's documented event editor link. The user reviews and saves in their signed-in browser. This is not account sync or an OAuth connection. ICS export supports other calendar apps without setup.
- Prefer built-in `node:sqlite` in modern Electron after an actual runtime check, avoiding a native SQLite binding/rebuild dependency.
- Use electron-builder for a conventional Windows installer and unpacked build; this replaces the proposed Forge default.
- Local extraction produces labeled key passages without an AI key; a separately configured hosted model can produce AI results. Never label local extraction as AI.
- GitHub publication remains pending account switch from CltadeI to marcusdiccox. Do not create the project under the wrong account.

## Progress

- Design, epic, and implementation plan written. Four Markdown files and nine epic/task IDs validated; design builder check found no important gaps.
- Started feature work; backend behavior tests are being written before implementation.
- Implemented SQLite project/note persistence and immutable note revisions, scoped FTS5 search, local cited summaries and passage answers, journal revisions, dossier export, reminders and Google/ICS event drafts.
- Built React desktop interface and CSS Pip companion, isolated Electron bridge, tray lifecycle and notification polling. A Windows unpacked build succeeds with Electron 45.2.2 and built-in SQLite.
- `npm test`: 13/13 backend tests pass; `npm run typecheck` passes. Electron journeys currently verify notes/restart and reminder/calendar workflows; final full rerun plus accessibility checks is in progress.
- Fixed completed-reminder usability discovered in E2E: reopening now returns to Upcoming. Test selector mistakes were corrected to scope visible breadcrumb and current journal text.
- Hosted AI/provider credential management from the original long-term plan is not implemented in this first usable local build. UI explicitly labels extraction and passage search; it never simulates a live AI response. This keeps the first build usable without account setup.
- During the initial build, GitHub publication waited for the requested account switch from CltadeI to marcusdiccox. This was resolved during publication below.

## Final verification of the first local build

- 15/15 backend tests and TypeScript checks pass.
- 4/4 desktop journeys pass in development Electron and again against `release/win-unpacked/Research Buddy.exe`.
- Automated contrast/keyboard checks pass on the home screen and reminder form. Increased muted text contrast without losing the soft palette.
- Independent review's three P2 findings fixed with failing-then-passing regressions: stale summary warning/suppression, complete journal history, and notification success acknowledgment plus failure retry/backoff and visible status.
- Packaged SQLite persistence and source/research/reminder/journal flows verified. NSIS installer generated; no signing certificate or clean-machine installation is claimed.
- SVG/PNG/ICO Pip artwork committed as code-native assets; app window, tray and installer use it.
- Complete epic contains RB-01 through RB-10. The publication step below resolved the initial account mismatch.

## GitHub publication

- Switched GitHub CLI to marcusdiccox through the existing Chrome session, with explicit authorization and user-supplied email verification. No credentials or verification codes are stored in project files.
- Created public repository https://github.com/marcusdiccox/research-buddy and pushed the verified source to main.
- Published epic https://github.com/marcusdiccox/research-buddy/issues/1 and ten native child issues (#2–#11), with a v0.1 milestone.
- Hosted CI was triggered by the initial push; local build/test evidence remains recorded in the release checklist.
- The first hosted run passed type checks, backend tests, build, and desktop tests. Its installer was built, but electron-builder's implicit CI publishing attempted an unconfigured release upload. Packaging now explicitly uses `--publish never`; GitHub Actions uploads the installer artifact separately.
