# Early Windows build verification

This is an early local build, not completion of the entire original epic.

## Verified in this session

- TypeScript checks pass.
- 15 backend tests pass against real temporary SQLite databases: persistence, note revisions, scoped search, input rejection, journal evidence, local summaries, dossier exports, calendar content, reminder reservation/retry behavior.
- 4 Electron desktop journeys pass: note creation/summary/evidence/restart, reminder/calendar/snooze/completion, sample research/questions/journal revision history, and keyboard/contrast checks on the main screen and reminder form.
- Independent source review identified stale summaries, hidden historical journal fields, and consumed failed notifications. Each received a failing regression check before its fix; the full suite then passed.
- Unpacked Windows build succeeds with built-in `node:sqlite`.
- Pip icon is rendered from the committed SVG, not a third-party asset.

## Distribution checks

- [x] NSIS installer generation.
- [x] Run the same four Electron journeys using the packaged executable: 4 passed.
- [x] Hosted Windows CI passed type checks, all tests, build, installer packaging, and artifact upload: [run 41779474518](https://github.com/marcusdiccox/research-buddy/actions/runs/41779474518).
- [x] Installer: `release/Research Buddy Setup 0.1.0.exe` (123,555,355 bytes). Unpacked app: `release/win-unpacked/Research Buddy.exe`.

Installer SHA-256: `30FD38BF91A394060F877BD2F17ED77C1BD8092FD600903C5DD9457FF35C634F`.

Packaged hidden-window screenshots were omitted because Chromium capture timed out in the packaged build; behavior and accessibility assertions ran unchanged. Visual screenshots were captured and inspected from the normal development Electron runtime.

## Environmental limits

- Tests run on the development Windows computer. Installation on a separate clean Windows 11 x64 machine has not been tested.
- Native delivery success/failure callbacks are tested using a controlled event emitter at the OS boundary; actual toast visibility depends on Windows notification settings. E2E mode disables sending real toasts.
- Calendar payloads, UTC times, ICS escaping and fixed Google host are tested. Saving an event in a real signed-in Google account is a user action, not performed automatically during verification.
- Automated accessibility checks cover the main screen and reminder form, not a complete accessibility audit of every state.
- The installer is unsigned. Hosted AI, direct calendar account sync, recurrence, PDF/OCR, deletion and full backup/restore are outside this early build.
- `npm audit --omit=dev` reports zero runtime dependency advisories. The packaging toolchain currently reports 15 moderate development dependency advisories; the suggested forced downgrade is not applied. These are not runtime dependencies bundled into the application service.
- The project has no selected open-source license yet; no public software release has been published.

## Review decisions

Hosted AI and OAuth sync from the broader proposal remain deferred; the current interface uses honest local-processing and event-draft descriptions. Native toast delivery, signed-in calendar saving, and clean-machine installation remain environment-specific checks as described above. These limits must not be presented as verified behavior on another computer.
