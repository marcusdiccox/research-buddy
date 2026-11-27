# Quick capture, pet play, Today and No jokes

Status: approved by the user November 26, 2026, including installation on their computer.

## Intent

Extend Pip's existing small desktop companion with the three additions the user selected: quick capture, treats/ball interactions, and a Today bubble. Add the user's follow-up request for a No jokes option. Keep notes easy to reach and the desktop readable.

The current Electron app already has an 80px pet, a 360x340 note bubble, a saved library, local reminders, recurrence, a floating focus timer, independent animal/color settings, startup and GitHub updates. Reuse these components and the SQLite store.

## Approach and decisions

The user selected features from the prior proposal, including selecting text and pressing a shortcut. Extend the current bubble and pet menu rather than creating another main application surface. The detailed defaults below are implementation proposals, not preferences already expressed by the user.

For capture, two approaches were considered: reading text already copied to the clipboard, or copying the current selection when the shortcut is pressed. The proposed primary flow uses the selected-text approach to match the prior proposal; an explicit Capture copied text action provides a simpler fallback. This needs a small Windows helper because Electron's clipboard API reads copied text but cannot copy another app's selection by itself. It introduces no new network service or AI dependency.

For play, use the existing animal sprite atlases with short, coordinated movement and small pixel-style treat/ball/heart overlays. New large image sheets are unnecessary for these interactions. Fox, red panda and otter keep their current skins and recognizable behavior.

For Today, add a fourth mode to the existing bubble. A separate dashboard or persistent startup window would add another surface to manage. Today uses local reminders and notes already stored by Pip.

## Quick capture

- Default shortcut: Ctrl+Alt+N, independent of Ctrl+Alt+P. Show a concise label in Settings, and report registration conflicts with a tray fallback. Do not silently replace the existing pet shortcut.
- With text selected in another application, press the capture shortcut. Capture only on that explicit action, then open the Notes bubble with the captured text ready to review. Save still requires the existing Save action.
- A hidden Windows helper waits briefly for shortcut keys to be released before sending an ordinary Copy chord to the same foreground window. Abort if the foreground window changes before copying; never focus Pip before copying.
- Applications that do not support ordinary Copy, or run at a higher Windows integrity level, may require the copied-text fallback. This follows the documented [SendInput limitations](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput). The [clipboard sequence number](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber) is used only during this explicit capture attempt.
- Detect a new clipboard sequence rather than treating stale clipboard text as the selection. Unsupported selections, key-release timeout or unchanged clipboard produce a short explanation and an empty capture prompt, while preserving an existing draft.
- Copying can replace the clipboard just as an ordinary Copy action does. Do not claim to restore arbitrary clipboard formats. The fallback Capture copied text action reads existing text only when explicitly invoked.
- Use Unicode plain text only. Reject empty or over-limit text with useful feedback; preserve the existing 100,000-code-point note limit. Read no images, files, rich text or background clipboard history.
- If the bubble contains an unsaved draft, append captured text with a clear paragraph separator; do not replace the draft. When the current editor is a saved item, capture starts a separate new-note draft while retaining the previous saved item. Capturing while editing an unsaved reminder retains that reminder draft separately.
- Focus the captured draft and leave it available for conversion to a reminder/calendar item using the existing mode controls.
- Captured text travels only from the helper to the main process and renderer. Never place it in process arguments, logs, errors, analytics or network requests. The main process enforces sender allowlists, action validation and size limits.
- Keep helper code a static packaged resource; launch it hidden with fixed arguments and a bounded timeout. Never interpolate selected text into shell commands. Bound output size and terminate the helper on timeout or app quit.

## Treat and ball interactions

- Add Give treat and Toss ball to Pip's right-click menu. Keep the existing animal-specific greeting/play action.
- A treat appears near Pip's paws; Pip leans/bobs or lifts its paws, followed by a small heart reaction. The red panda gives a tail/paw hug, the otter holds the treat in its paws, and the fox perks up with a small happy hop.
- A ball follows a small, visible arc toward Pip, bounces near its paws, and is caught or nudged back with a brief movement reaction. Keep the scene inside the current pet overlay. This is a short interaction, not a full-screen chasing game.
- Coordinate the sprite and prop on one main-process interaction timeline. Pause ordinary wandering and chatter during the sequence, then return through existing stand/sit transitions. Wake a sleeping pet through its existing wake transition first.
- One interaction at a time; starting another replaces the old sequence cleanly. Hiding Pip, dragging, opening notes or shutting down cancels play and removes props. Urgent reminder messages remain deliverable and take priority over play.
- Preserve click-through empty space and a usable pet click target. Props do not capture clicks. No sounds, currency, hunger meter or penalty for neglect.
- Reduced motion replaces hops and ball arcs with a short static prop/heart reaction. All three animals and all three appearance options work.

## Today bubble

- Add Today access to the bubble, tray and pet menu. The compact card uses the same pin-on-hover and blur-to-hide behavior as Notes. Switching between Today and Notes preserves drafts.
- On the first intentional ordinary pet/notepad opening of each local calendar day, show Today. Subsequent ordinary openings show Notes as before. Explicit quick capture, reminder and calendar actions always open their requested mode.
- Do not pop Today onto the screen merely because Windows starts or the date changes. Persist the last intentionally shown local date; use the user's local time zone.
- Display a short date heading, incomplete overdue reminders and today's incomplete reminders, sorted by due time with overdue items clearly labeled. Include reminder items even when their optional alert checkbox is off. Exclude trashed and completed items.
- Use a scrollable list without increasing the native window size. Show concise times/titles, an empty state, New note and New reminder actions, plus the three most recently edited notes for quick access.
- Opening an existing item uses the current notebook/item navigation, preserving any unsaved quick-note/reminder draft. Completing a reminder uses the existing recurrence and calendar-sync logic and refreshes the view.
- Today's data is local Pip data; do not imply that unrelated Google Calendar events have been imported or that notes are a separate task model. Existing future reminder behavior is unchanged.
- Refresh after item changes and when reopened; re-evaluate the local day while a pinned Today view stays open.

## No jokes

- Add No jokes alongside Wholesome, Dad jokes and Nerdy in the compact settings and any other joke-style selector.
- Persist it as an explicit supported preference, retaining existing saved themes for other users and supporting upgrades from existing settings.
- Disable automatic casual joke/phrase bubbles while selected. Do not show a joke when waking or completing a play interaction; use animations/hearts for those reactions.
- Keep reminder, error, capture and other functional messages active. Turning jokes off dismisses a current casual bubble but preserves an active urgent reminder.
- Turning jokes on schedules the next casual line normally rather than immediately flooding the user with missed phrases.

## Acceptance and verification

Tests must cover capture success, stale/empty/oversized text, foreground/key timeout, existing draft preservation and shortcut conflicts using fictional content. Native helper integration is exercised against a controlled scratch document; never against personal notes or authentication windows.

Behavior tests cover treat/ball completion and interruption, sleep/wake transitions, reminder priority, reduced motion, animal variants and No jokes persistence. Today tests cover local midnight boundaries, overdue/completed/trashed items, recurrence completion, navigation/draft retention and once-per-local-day opening.

Run the existing backend suite, type checking, build and native desktop regressions. Inspect the compact UI and interactions on Windows with isolated profiles. Package and verify update metadata before publication. Do not close a running production note or focus session just to demonstrate a preview.

## Scope and remaining implementation choices

No new cloud provider, hosted AI, Google event import, additional animal species, reward system or backup-restore feature is part of this change. The builder may choose exact spacing, icons, interaction durations, helper implementation details and small internal abstractions within the behavior above. A later implementation plan will divide the work after this design is approved.

Read-only builder review found no important unanswered planning questions.

## Approved scope addition

During implementation the user additionally requested a Mac version and committing all work to GitHub. Package a universal Intel/Apple-silicon app as DMG and ZIP on a macOS runner, with native login startup and a Mac selected-text helper. Use Command+Option+N for Mac capture. The Mac helper requires user-granted Accessibility/Automation for copying selections; copied-text capture remains available without that automation. The first Mac build is ad-hoc signed, not Developer ID signed or notarized, so Mac update controls open release downloads rather than claiming unattended updates. Exercise the packaged universal app's feature tests on macOS CI.
