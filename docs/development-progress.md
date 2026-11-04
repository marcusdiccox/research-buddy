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
- The corrected hosted run passed every required step, including NSIS packaging and installer artifact upload: https://github.com/marcusdiccox/research-buddy/actions/runs/41779474518.

## Fox companion update — 2026-11-04

Plan: `docs/superpowers/plans/2026-11-04-fox-companion.md`.

- User selected bottom-edge wandering by default and requested red/light, Arctic and dark fox appearances plus configurable jokes/behavior.
- Replaced the sprout with SVG/CSS fox artwork and blinking, breathing, walking, waving and sleeping poses. Fixed the opaque HTML-root background, removed permanent pet labels/buttons, and added native click-through hit regions.
- Added a pure behavior engine, native companion controller, three roaming choices, three joke themes, four chatter levels, reduced motion, alternate shortcut presets and conflict fallback. Shortcut Ctrl+Alt+P uses showInactive so the notebook does not steal focus.
- The app now starts with just the fox; its menu opens the existing notebook/reminder/settings views. Settings persist in the original SQLite database without changing note records.
- Independent review found native-close visibility inconsistency, stale shortcut tooltip and interrupted position persistence. Regression checks were observed failing before the fixes. Close now hides; one toggle restores; quit releases shortcuts/timers and saves the settled position.
- 23 backend tests pass. Packaged nine-journey desktop verification and real-desktop checks are being completed before publication.

## Pixel fox and livelier behavior � 2026-11-04

- User supplied the pixel fox visual reference, then requested more movement, a smaller pet, posture transitions and automatic sleep. Generated original transparent base/transition atlases with the built-in image tool; the reference image is not redistributed.
- Renderer uses64px logical sprite frames at104px desktop size, shared Arctic/Midnight palettes, alpha-tested edges and aligned ground baselines. Idle, walking, waving, sleeping, stand-up, sit-down, curl-up and waking stretch are distinct poses.
- Rest1.8�4s, walk7�12s at32px/s. After120s without fox interaction Pip curls up automatically. Hover/click wakes; manual nap action removed. External keyboard activity is not monitored.
- Fixed real-launch background throttling: visible companion continues rendering without keyboard focus, hidden companion throttles/stops timers.
- Focused independent reviews found a baseline jump and click-release cancelling waking. Both were reproduced in regressions before fixes. Every atlas cell now shares ground row60; pointer release preserves the wake transition.
  - 24 backend tests and 12 packaged desktop journeys pass. Archive SHA-256 integrity verified for all4,737 packed files. Native normal-launch screenshot confirms the smaller pixel fox visibly walks over the desktop.

- Packaging note: modifying the included artwork README during packaging changed its size and invalidated archive offsets. Rebuilt with inputs held unchanged, verified every archive file against its SHA-256 metadata, then reran all12 packaged journeys successfully.
