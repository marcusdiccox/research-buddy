# Pip visibility correction — November 11, 2026

The installed app was running and Ctrl + Alt + P toggled its native window, but the pet remained underneath ordinary application windows. An isolated native experiment showed isAlwaysOnTop=false with the previous default level. Applying the explicit pop-up-menu level changed it to true and made the otter visibly draw over the desktop. No sprite change was needed.

A new regression failed against 0.9.1 with visible=true and top=false. With the correction it verifies showing, an unrelated setting change, disabling always-on-top, hiding and restoring. All 10 pet desktop tests passed locally, including shortcut restoration and entrance movement. The packaged 0.9.2 copy passed the three focused native regressions. All 235 backend tests and the build passed.

[Hosted Windows run 42978098292](https://github.com/marcusdiccox/research-buddy/actions/runs/42978098292) passed type checking, all 235 backend tests, all 55 desktop tests, build and installer packaging for source commit 2ab1b0ac6aafce817842440c1d5ce0b9328b03ea.

All 5,019 packaged files passed embedded SHA-256 validation. The compiled companion module matches the archive. Installer size/SHA-512 match latest.yml, the updater retains the fixed GitHub feed, and GitHub's SHA-256 digests match all three local assets. Installer SHA-256: FD1BC2FBD6AE25B8C9280AF8576AE413F8B4C82A198E3148CB00553CF85DAABD.

[Version 0.9.2](https://github.com/marcusdiccox/research-buddy/releases/tag/v0.9.2) is published as latest and installed on the user's computer. Saved notebook records were checked against the pre-install backup. Computer Use confirmed the installed fox visibly drawing at the bottom edge; final preferences report petVisible=true, alwaysOnTop=true and Control+Alt+P. Isolated test apps were closed. Windows code signing remains unconfigured.
