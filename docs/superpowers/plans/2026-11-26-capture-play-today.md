# Capture, play, Today and No jokes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship and install the four approved additions to Pip.
**Architecture:** Extend the existing pet state machine and compact bubble. Keep Today selection and capture/draft validation in small pure modules, and Windows selection copying in a bounded native helper controlled by Electron.
**Tech Stack:** Existing Electron, React, TypeScript, SQLite, Vitest and Playwright; no new dependencies.
**Spec:** ../specs/2026-11-26-capture-play-today-design.md

## Global Constraints

- Ctrl+Alt+N captures selected text; Ctrl+Alt+P keeps its existing function.
- Capture is explicit, local, plain text, at most 100,000 code points and 2 MiB; drafts are preserved and Save remains explicit.
- Treat/ball props stay inside the pet overlay, preserve click-through space and respect reduced motion and urgent reminders.
- Today uses local dates and existing reminder completion/recurrence, with no automatic startup popup.
- No jokes suppresses casual speech, preserving functional and reminder messages.
- Preserve saved user data and check for a production draft/focus session before installing.

## Review Focus

- Switching modes or capturing into a saved item must not overwrite an old note or an unsaved reminder.
- Another application can change focus or clipboard while capture is pending; abort without reusing stale text.
- A reminder or reduced-motion change can interrupt play; props must not linger.
- Local midnight and DST must not duplicate daily opening or hide overdue reminders.
- Registration failure, missing helper or oversized clipboard content must leave the tray fallback usable.

### Task 1: Pet interactions and No jokes

**Files:** src/core/pet.ts, src/shared/contracts.ts, src/core/store.ts, src/main/companion.ts, src/renderer/{PetWindow,CompactSettings,App}.tsx, src/renderer/pet.css; tests/pet-interactions.test.ts and pet desktop tests.
**Interfaces:** PetBehavior.startInteraction(kind: 'treat'|'ball', now: number), cancelInteraction(); PetView.interaction optional {kind, startedAt, durationMs}; petJokeStyle additionally accepts 'off'.
- [ ] Write and run failing tests for No jokes, reminder retention, play completion/cancellation, sleep wake and reduced motion.
- [ ] Implement the timeline and main-process cancellation; render species-specific small CSS/pixel props and menu actions; add all No jokes selectors.
- [ ] Run focused tests, full backend suite and type checking; commit the working feature.

### Task 2: Today mode

**Files:** new src/core/today.ts, src/renderer/TodayBubble.tsx; existing QuickBubble, main, contracts, store, preload and floating CSS; tests/today.test.ts and new desktop coverage.
**Interfaces:** localDayKey(date: Date): string; todayItems(snapshot, now) returns overdue, upcoming and recentNotes; NotebookAction includes 'today'; Settings.lastTodayDate stores a local day key.
- [ ] Write and run failing date-boundary/filtering tests plus first-open, draft-preservation and recurrence desktop cases.
- [ ] Add the compact fourth mode, once-per-local-day ordinary opening, explicit tray/pet access, item links and completion controls. Keep existing drafts mounted.
- [ ] Run backend and relevant desktop tests, type checking; commit.

### Task 3: Quick capture

**Files:** new src/core/capture.ts, src/main/capture.ts, assets/windows/capture-selection.ps1; existing QuickBubble, preload, contracts, main and settings; tests/capture.test.ts and desktop coverage.
**Interfaces:** validateCapture(text: unknown): string; appendCapture(draft: string, captured: string): string; CaptureController returns {text?,error?} and owns shortcut registration/child lifecycle; preload exposes an authenticated capture-payload read action.
- [ ] Write and run failing validation, clipboard-sequence, pending-capture and draft-retention tests.
- [ ] Implement the Windows key-release/foreground/clipboard sequence helper and bounded child wrapper. Register Ctrl+Alt+N, add copied-text fallback and concise settings status. Deliver one consumable payload after showing Notes.
- [ ] Preserve an unsaved reminder separately during capture; a saved note gets a new draft, not an update. Validate appended text before changing the draft.
- [ ] Run backend, capture desktop and controlled native scratch-selection tests; commit.

### Task 4: Release and installed copy

**Files:** package versions, README, release notes and verification record.
- [ ] Add the subsequently requested universal Mac DMG/ZIP, native login startup, selection-capture helper and manual release-download updates; run backend and packaged feature tests on macOS CI.
- [ ] Run full backend/type/build/native desktop checks; visually inspect fictional-profile Today/play/capture. Obtain one independent whole-branch review, fix material findings with regression tests.
- [ ] Build 0.10.0, verify archive and updater metadata, push source and publish only after hosted Windows checks pass.
- [ ] Back up production data, inspect active notes/focus, install and open the user's updated copy, then verify its version, data and visibility.
