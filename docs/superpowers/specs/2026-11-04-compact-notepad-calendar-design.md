# Compact notepad and connected calendar

User refinements: click the smaller fox to open its own small notepad, with Notes, Reminders and Calendar modes. Open fox settings in a separate compact window. Automatic small joke bubbles have no manual joke button or chatter-off selector. Wander randomly in both directions at varied but clickable speeds, less often than the preceding build.

Implementation: reuse the existing SQLite notes/reminders and native bridge. Add lazy #notepad520x600 and #fox-settings400x590 windows; keep full research tools as a secondary option. Notes are explicitly saved and drafts survive mode changes/errors. Calendar-mode reminders opt into automatic one-way creation/update in Google Calendar. Plain notes remain local. Changes made directly in Google are not imported in this iteration.

Google connection: Google Desktop OAuth client, browser authorization-code flow with PKCE and random-state loopback callback, calendar.events.owned scope, primary calendar only. Import the user's desktop client JSON through a native picker; store config/tokens encrypted with Electron safeStorage in userData, never repository or renderer. Record per-reminder event IDs, fingerprints and pending/error status in SQLite. Deterministic IDs plus409 recovery prevent duplicate creates; retry transient failures without claiming sync success. Disconnect clears local credentials and attempts revocation; existing remote events remain. No invitations, attendee notifications or unrelated calendar edits.

Google registration is required before sign-in. Inspect the user's Cloud console for an existing appropriate client; if none, prepare the setup and request any action-time confirmation required by the computer-use skill before creating persistent access. Google approval and any unverified-app barrier are user-controlled.

Movement choice:80px pet control, rest3.5–7s, walk4–8s, per-stroll speed12–24px/s, random left/right directions with monitor clamping; hover remains a pause. Auto jokes first18–30s then35–65s while awake; auto sleep after120s without fox interaction remains.
