# Floating focus timer — November 10, 2026

The focus session engine is unchanged. A separate 280x180 transparent, frameless ivory/sage card opens without activating when focus starts. It supports pointer-captured dragging, independent persisted pinning, hide/restore without resetting, completion feedback and cross-window stopping. Pin controls are revealed on hover or keyboard focus; note pinning has the same treatment.

Native Windows testing found and addressed fractional-DPI size drift (reassert fixed bounds), insufficient default floating level (use the supported pop-up-menu level when pinned), inactive transparent rendering (disable throttling while visible only), and short drags that finish before a 25 ms poll (commit the final cursor position on release). A real Computer Use drag moved the isolated test timer from (1407,20) to (1342,90), exactly the requested -65/+70 movement. No production notebook was used for that test. Independent reviews found no important defects in the lifecycle or the subsequent drag implementation.

235 backend tests and TypeScript/build passed. Six new native desktop cases cover popup geometry/focus/pinning/keyboard visibility, hide/restore, deadline completion/restart, stop while opening, unfocused painting and very quick dragging. The packaged full run passed 53/54 cases; the remaining date-picker case passed its functional checks but hit EPERM deleting its temporary profile after app shutdown. Its isolated packaged rerun passed, as did the final focus preview case. Hosted Windows full regression is checked before publication; this local cleanup failure is not reported as an app behavior pass.

All 5,019 packaged files passed embedded SHA-256 checks. Focus/main/preload modules match the compiled build. latest.yml version, size and SHA-512 match the installer, and app-update.yml retains the existing fixed GitHub release feed. Installer SHA-256: 1C2DD762BD9F106535E44BFE4559E3D774CC083A913364F7EB0EC2FA509A4543.

The running production app is left untouched while the release is prepared; its existing updater can download 0.9.1 and install on ordinary quit. Windows x64 code signing remains unconfigured.
