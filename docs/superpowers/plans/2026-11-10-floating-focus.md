# Floating focus timer implementation plan

Spec: ../specs/2026-11-10-floating-focus-design.md

- [x] Add failing native desktop tests for automatic popup, preserved focus, pinning, native movement, hide/restore, completion and stop synchronization.
- [x] Add focusPinned preference, panel-status contract, validated IPC and reusable native timer window lifecycle; keep the session engine unchanged.
- [x] Render the compact ivory/sage card and progress ring. Exclude controls from dragging, reveal pin on hover/focus, and apply note-pin reveal consistently.
- [x] Verify placement bounds, native behavior, keyboard controls and appearance; obtain independent review. Hosted full regression remains a publication gate.
- [x] Build version 0.9.1, validate updater assets, commit/push, publish after Windows checks and deliver the update without interrupting active work.
