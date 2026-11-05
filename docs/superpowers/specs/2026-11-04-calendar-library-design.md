# Calendar picker and saved library

Intent: make reminder scheduling and finding earlier notes/reminders comfortable in Pip's existing small windows. The user requested implementation plus research ideas only for any additional features. The user confirmed that the library includes both notes and reminders.

## Approaches

A native date/time input is inexpensive but its OS picker cannot match Pip or give consistent keyboard guidance. A large calendar page would overwhelm the tiny companion. Chosen builder proposal: a reusable, compact modal month grid with direct date/time fields, Today/Tomorrow shortcuts, keyboard day movement, Cancel and Done. It fits inside the existing bubble and larger notebook without enlarging the app permanently.

Existing workspace IDs organize research and citations; changing them would affect source relationships. Chosen builder proposal: independent local library groups with membership metadata. A searchable Saved view replaces long saved-item dropdowns as the main browsing route while the existing editors remain available.

## Scheduling UI

Use the same DateTimeField in QuickBubble, CompactNotepad and the advanced reminder form. A readable date/time button opens a native HTML dialog. Editable Date and Time fields and keyboard-operable month days provide alternative entry. Arrow keys move days, Home/End move to week edges, PageUp/PageDown change months, Enter selects, Escape cancels. Focus returns to the trigger. Done applies one validated local date/time; Cancel keeps the prior value. Month/year boundaries and leap days must work. Nonexistent local times are rejected instead of silently shifting. Fixed reminder lead times stay unchanged.

## Saved view

The bubble gains Saved; the compact notebook gains Saved items. The view includes search, type and group filters, short previews, readable timestamps/status, Open, selection checkboxes, group assignment and deletion. Existing notes/reminder drafts survive browsing and opening other items using the current draft maps. Opening an item returns to its editor. All controls have labels and keyboard focus indicators; no drag operation is required.

Groups can be created, renamed and removed. Removing a group leaves its items ungrouped. Items may belong to one library group; multi-select moves a chosen set together. Groups are independent of research workspaces and do not change revision IDs, citations or original note bodies.

Delete moves selected items to local Trash after an in-app confirmation. Trash can be searched and restored; there is no permanent-delete operation in this update. Trash removes notes from active searches and the current source list in exports and reminders from local scheduling/calendar outbox. Revision evidence stays available to existing saved research. Calendar events already uploaded to Google remain there; the dialog explains that local Trash does not delete Google events. Queued reminder callbacks tolerate missing/trashed items. Restoring notes restores search; restoring reminders preserves their opt-in and acknowledgement history. Only fictional test data will be deleted during validation.

## Research only

Write a short ranked ideas document with official product/help references. Candidates include natural-language dates, recurrence, a temporary focus session and local backups. None of these additional ideas is implemented in this update.

## Verification and delivery

Test real SQLite group/trash persistence, search exclusion/restoration, scheduler exclusion, stale queued callbacks, and atomic invalid bulk requests. Test month math/local input validation and desktop keyboard date picking, filters, groups, delete/restore, and draft retention. Run type/build/backend and full packaged desktop checks, review the changes, back up the real database, preserve any live unsaved draft and refresh the local executable. Publish the verified source to the already authorized public repository.
