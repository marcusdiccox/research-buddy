# Floating focus timer

The user wants focus to pop up as an attractive movable timer that can stay pinned, with its pin hidden until hover. Keep the existing quiet-focus behavior and durations.

Use a separate transparent, frameless 280x180 native window, initially near the upper right of Pip's monitor. Give it a warm ivory/sage card, large tabular countdown and restrained progress ring. The card uses pointer capture and native cursor tracking with buttons excluded. Preserve the dragged position across hide/show; clamp it if monitors change. Start opens it without stealing focus from notes. Pin defaults on, persists independently of note pinning and the pet's always-on-top option, and maps to native always-on-top. Reveal controls on card hover or keyboard focus. Give the existing note pin the same hover/focus reveal.

Hide closes only the card; focus keeps running. The inline timer gains Show timer for restoration. Stop from any surface stops the session, resumes Pip and hides the card. Completion remains visible as a finished state and keeps the existing one-time Pip announcement. Absolute deadlines, 15/25/45-minute choices, urgent reminders, and session-local quit behavior remain unchanged. No sounds, pause feature, or OS focus setting changes.

Validate native geometry/topmost state, movement and clamping, hover/focus visibility, hidden-session continuity, cross-window stop, deadline completion and existing reminder priority. Use isolated app profiles and inspect the actual rendered card. Publish a tested patch release through the existing update feed.
