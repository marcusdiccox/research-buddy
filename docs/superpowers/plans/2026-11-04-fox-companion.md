# Fox Companion Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation; request a fresh code review before publishing.

**Goal:** Make Pip a genuinely transparent, animated, wandering desktop fox with useful actions and approachable behavior settings.

**Architecture:** A pure companion behavior engine calculates bounded movement, pose and phrases. A main-process controller owns the native window, cursor hit testing, dragging, lifecycle and global shortcut; a React renderer draws the fox and its temporary speech/menu surfaces. Existing notebook/reminder functions remain the source of truth.

**Tech stack:** Existing Electron, React, TypeScript, SQLite, Vitest and Playwright; code-native SVG/CSS artwork.

**Spec:** [Fox design](../specs/2026-11-04-fox-companion-design.md).

## Global constraints

- Windows desktop; silent and offline.
- Default bottom-edge wandering; current-display bounds only.
- Red, Arctic and Midnight appearances; three joke styles; three chatter frequencies.
- Ctrl+Alt+P toggles visibility by default; preserve a tray fallback.
- Hidden, hovered, dragged, menu-open, sleeping and reduced-motion states suspend autonomous movement appropriately.
- Transparent unused window space passes clicks through; only pet/bubble/menu intercept input.
- Persist settled positions, not per-frame animation positions.

## Review focus

1. Native transparency versus only a transparent body: cover HTML root and window background in Electron tests.
2. Shortcut conflicts, re-registration and hidden restoration: cover controller registration and actual shared toggle path.
3. Mouse capture while the native window moves: cover drag pause, pointer release and transparent hit regions.
4. Non-primary monitors, taskbars and negative coordinates: pure geometry tests plus runtime clamping.
5. Background work and repeated SQLite writes: timers stop while hidden; positions save at rest/drag end.

## Tasks

### 1. Behavior engine and persistent settings

Create `src/core/pet.ts`, extend `src/shared/contracts.ts` and `src/core/store.ts`, add `tests/pet.test.ts`.

- [x] Write failing tests for bounded roaming, negative coordinates, stationary/paused/hidden behavior, reduced motion, chatter intervals and non-repeating joke selection.
- [x] Add settings persistence tests for all three skins and validated enum/shortcut choices; run to observe missing behavior.
- [x] Implement deterministic time/random injection, movement/rest decisions, pose and bubble state, and validated settings defaults.
- [x] Run backend suite and type checks.

### 2. Transparent fox renderer and interaction surfaces

Create `src/renderer/Fox.tsx`, `src/renderer/PetWindow.tsx`, `src/renderer/pet.css`; update `main.tsx` and existing Pip uses.

- [x] Add failing Electron checks for transparent root, absence of permanent controls, fox appearance, click menu and reduced motion.
- [x] Render three SVG fox palettes and breathing/blink/walk/wave/sleep CSS animations. Remove the old sprout pet, label and always-visible buttons.
- [x] Implement transient bubbles, accessible menu, pointer capture for dragging and validated interactive-region reporting.
- [x] Inspect all three skins, then run desktop checks.

### 3. Native controller, movement and shortcut

Create `src/main/companion.ts`; update main process, preload and shared bridge contracts; add controller tests as needed.

- [x] Write failing tests for visibility toggle/shortcut conflict and native bridge behavior.
- [x] Move companion lifecycle into a focused controller; set transparent native background, clamp bounds, move in slow bursts, handle dragging and pointer hit regions, and debounce settled-position persistence.
- [x] Register/unregister the chosen global shortcut after app ready; stop timers and clear transient UI on hide. Restore from tray without stealing focus.
- [x] Add a narrow notebook navigation event for new-reminder/settings actions; verify existing source/persistence behavior still passes.

### 4. Settings and useful actions

Update the companion settings panel in `src/renderer/App.tsx` and supporting types.

- [x] Add failing UI checks for appearance, roam area, joke style, chatter frequency, reduced motion and shortcut selection/persistence.
- [x] Add clear controls, shortcut status/conflict text and click-menu routes to existing reminder/settings views.
- [x] Confirm selections update the live fox and survive restart.

### 5. Review, packaging and publication

- [x] Run type checks, full backend tests and desktop journeys; inspect desktop transparency and animations visually.
- [x] Obtain an independent review, fix significant findings with regressions, and rerun required checks.
- [x] Build the updated Windows installer in a separate output directory so the currently running app is not overwritten.
- [x] Update README/artwork/docs, publish changes to the existing public repository, and verify Windows CI.
