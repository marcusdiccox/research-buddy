# Automatic notebook backups implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline. Steps use checkbox syntax for tracking.

**Goal:** Add and commit automatic local notebook snapshots.

**Architecture:** A core backup helper reads the live database through SQLite, verifies a temporary snapshot and publishes it before retention. Main calls it at startup and every 30 minutes; errors are returned and logged, not thrown into startup.

**Tech stack:** Existing TypeScript, node:sqlite, node:fs, Electron, Vitest and Playwright.

**Spec:** ../specs/2026-11-09-local-backups-design.md

## Global constraints

- At most one snapshot per UTC date; retain seven managed snapshots.
- No new dependencies, cloud transfers, restore UI or changes to the active notebook.
- Never prune until a new snapshot has passed SQLite quick_check and been published.

## Review focus

Live WAL writes, clock/date boundaries, unrelated files, disk failure and repeated app launch must preserve notebook content and prior snapshots.

## Task 1: Snapshot backend and startup integration

Files: create `src/core/backups.ts` and `tests/backups.test.ts`; modify `src/main/main.ts`, a desktop startup test and `README.md`.

- [x] Write real-database tests for backup fidelity, same-day immutability, next-day creation, seven-file retention and failure isolation. Observe missing-feature failures.
- [x] Implement `backupNotebook(databasePath: string, now?: Date): BackupResult` with created/skipped/failed outcomes, unique temporary file, quick_check, atomic rename and exact-name retention.
- [x] Call at startup before UI loading and on an unref'd 30-minute interval. Log failure without stopping the app.
- [x] Add a desktop restart test proving the current profile gets a readable snapshot without altering active notes.
- [x] Run backend tests, TypeScript/build and desktop tests; review the complete diff.
- [x] Document backup location/limits and commit the tested update.

## Verification

November 9: `npm test` passed 217 tests; `npm run typecheck`, `npm run build` and `git diff --check` passed. `npm run test:e2e` passed all 44 journeys using isolated profiles. The new restart test waits for the pet renderer to finish startup before requesting quit; closing during initial loading had triggered the shutdown guard. An independent review found no important or critical issues. The installed production profile and existing 0.8.0 release asset were not modified.
