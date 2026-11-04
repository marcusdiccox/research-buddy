# Pip the fox: desktop companion

Visuals, movement timing and sleep controls below are superseded by the user refinement in [Pixel fox design](2026-11-04-pixel-fox-design.md).

The user requested a small fox without a visible background, a few animations, wandering, friendly help offers and jokes, a shortcut to activate/deactivate it, and settings controlling its behavior and appearance. The user selected **mostly along the bottom edge** as the default.

## Proposed implementation

Use code-native SVG/CSS artwork and animation within the existing Electron companion. This keeps the fox crisp across Windows display scales and allows three appearances without downloading assets. A sprite sheet is a valid alternative but adds an art/export pipeline; retain the existing app architecture and implement SVG/CSS here.

The fox is the default desktop experience. Its idle footprint is roughly 120 pixels wide, with no permanent caption, panel or buttons. The entire HTML canvas and native window must be transparent; unused space passes clicks through to the application below. Temporary speech bubbles and a click menu are the only extra visible surfaces.

## Behavior

- **Appearances:** Red Fox (light), Arctic Fox, Midnight Fox (dark). Appearance changes the pet, not the notebook theme.
- **Animations:** subtle breathing/blinking, a walking bob with moving paws/tail, a friendly wave, and a sleeping pose. Respect reduced motion; this also prevents autonomous wandering while preserving direct interaction.
- **Wandering:** default bottom edge; optional whole-screen wandering or staying put. Use the current display's work area, preserve negative monitor coordinates, stay clear of the taskbar, and recover onto a connected display after monitor changes.
- Walk in short, slow bursts with long rests. Pause during hover, menus, dragging, sleeping, reduced motion, or when hidden. Drag the fox itself to place it; resume wandering after interaction ends.
- **Chatter:** temporary silent speech bubbles with help offers, encouragement and jokes. Default Friendly frequency is 90–180 seconds; Quiet is 4–7 minutes; Chatty is 30–60 seconds. Bubbles last 8 seconds. No repeating the same phrase consecutively.
- **Jokes:** Wholesome, Dad jokes, or Nerdy. Chatter can be turned off independently of wandering. The click menu offers a joke immediately even when automatic chatter is off.
- **Click menu:** open notebook, new reminder, tell a joke, nap/wake, settings, hide. A new reminder opens the existing real reminder form; no duplicate task system.
- **Shortcut:** Ctrl+Alt+P toggles the fox without opening or focusing the notebook. Offer two alternate presets in Settings and report unavailable registrations plainly. Hiding suspends roaming/chatter/animation work; show restores the fox. Tray restore works even if a shortcut is unavailable.
- Persist appearance, roaming, joke style, chatter/frequency, reduced-motion preference, shortcut choice and visibility in the existing database. Do not write position to SQLite every animation frame; save settled positions only.
- No audio, screen capture, window inspection, AI service, network requests or computer actions beyond the user's selected notebook/reminder actions.

## Verification

Test movement bounds (including negative monitor coordinates), pause/hidden states, no consecutive phrase repeats, settings persistence/validation and shortcut conflict behavior. Electron tests must verify transparent HTML/native window configuration, menu/reminder actions, live appearance/settings changes, and show/hide via the shared shortcut toggle path. Visually inspect the fox on a real desktop, not just an isolated page. Test keyboard access and reduced motion. Keep all existing note/reminder/journal tests passing.

Original v0.1 exclusions for wandering and complex animation are superseded by this user-requested enhancement. The research and reminder data formats otherwise stay compatible.
