# Calendar and Saved Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Improve date/time picking and browsing, grouping and deleting saved notes/reminders; research additional ideas without implementing them.

**Architecture:** Reuse a DateTimeField across existing editors and add an ItemLibrary inside CompactNotepad. SQLite library metadata stores groups, membership and recoverable Trash without changing research workspace identities.

**Tech Stack:** Existing React, TypeScript, Electron, node:sqlite and Playwright; no new dependencies.

**Spec:** docs/superpowers/specs/2026-11-04-calendar-library-design.md

## Global constraints

- Keep the 360x340 bubble and 520x600 notebook; picker dialogs fit inside either.
- Keep five reminder checkpoints and Google opt-in semantics.
- Preserve revision evidence and unsaved drafts; test only fictional deletions.
- No additional researched feature is implemented.

## Review focus

- Trashed reminders already waiting in a delivery queue must be discarded safely.
- Trashed note text must disappear from active FTS and dossiers and return on restore.
- Bulk actions validate all refs before mutation; removing a group never deletes its items.
- Local DST gaps, leap days and month/year edges cannot silently change chosen dates.
- Compact dialogs must remain keyboard accessible and fit high display scaling.

### Task 1: Library persistence and bridge
- [x] Write tests/library.test.ts for groups, atomic bulk membership, soft Trash/restore, FTS restoration and reminder exclusion; run RED.
- [x] Add LibraryGroup, LibraryItemRef and LibraryState contracts and snapshot library data. Implement BuddyStore create/rename/remove group, groupItems, trashItems and restoreItems, with all/get active filtering and preserved revision history.
- [x] Add trusted IPC actions and guard delayed scheduled callbacks against missing/trashed reminders. Run tests and type checks GREEN.

### Task 2: Consistent date/time field
- [x] Write tests/date-time.test.ts and focused desktop date-dialog journey; observe RED.
- [x] Implement src/core/date-time.ts month/local validation helpers, src/renderer/DateTimeField.tsx and date-time.css. Replace three native datetime controls; update existing tests to operate the new picker.
- [x] Verify keyboard movement, Done/Cancel, direct date/time entry and unchanged underlying dueAt semantics.

### Task 3: Saved library UI
- [x] Write desktop library journey for search/open/group/delete/restore and retained editor draft; observe RED.
- [x] Implement ItemLibrary.tsx and library.css, add Saved entry points and library launch action, remove dropdown dependence, preserve draft maps and clear confirmed deleted drafts only.
- [x] Verify keyboard focus, empty states, bulk group operations, readable previews and compact layout.

### Task 4: Research, review and delivery
- [x] Save source-linked research-only ideas and update documentation.
- [x] Run backend/type/build/desktop checks and independent whole-change review; fix important findings.
- [x] Build frozen-input Windows package, verify archive integrity and packaged journeys; inspect visuals.
- [ ] Back up user data, preserve any live unsaved draft, refresh local Pip, publish source and verify hosted Windows build.

Ruling: continue in the clean existing checkout on a feature branch; the running application uses a separate packaged directory, and no concurrent source edits need isolation. The user confirmed both notes and reminders.

Review ruling: each bubble kind keeps a saved ID even when the single last-saved reference changes. Reconcile both IDs independently against the active snapshot; clean deleted content is cleared and unsaved text becomes an unbound draft. Both orderings have RED desktop regressions before the fix.

Verification ruling: Windows inspector wrappers occasionally outlive graceful Electron shutdown after every renderer closes. Test cleanup now requires an unprevented will-quit marker emitted after application database cleanup and zero remaining windows before terminating a lingering test wrapper. Missing graceful acknowledgement fails the test; real application quit failures are not accepted as passes.
