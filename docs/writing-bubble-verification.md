# Writing bubble update 0.4

The primary fox click now opens a transparent, frameless 360x340 writing bubble anchored beside Pip. Notes, Reminder and Calendar share the typed text; the optional Open notebook action expands the current item into the existing editor. Closing hides the bubble and keeps its draft. Pip pauses while the bubble is open. Settings are a frameless 340x400 panel with short labels and controls.

Review found and regressions reproduced unsaved editor replacement and custom title resets during re-expansion. Dirty editor fields are now retained, custom titles/source metadata persist, and a clean draft is not saved again merely to expand it. A launch-mode query also handles renderer readiness, and expansion follows the currently displayed text after changing note kinds.

Native testing discovered cumulative window growth during repeated position-only moves at Windows display scaling. Motion now sets an explicit fixed rectangle, so the fox's native bounds remain stable through entry and roaming. Bubble placement also sets explicit dimensions. The entrance regression checks both bounds and width stability.

Verification: 42 backend tests and 26 packaged desktop journeys pass; all 4,740 archive files pass SHA-256 integrity checks. Fictional bubble/settings screenshots were inspected, and the updated app was launched and visually verified on the user's desktop. Existing unsigned/clean-machine limitations remain. Google account setup is unchanged and is not claimed as a completed live connection.

Installer: `release-pip-bubble/Research Buddy Setup 0.4.0.exe`. Local SHA-256: `80212ECEC7147134A6E1CD064723BB7E6AD22172640CF879B11E52282A6F09F1`.

Hosted Windows checks, all tests, installer generation and artifact upload passed: [run 41909043594](https://github.com/marcusdiccox/research-buddy/actions/runs/41909043594).
