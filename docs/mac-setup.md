# Pip on Mac

Download the `Pip-0.10.0-mac-universal.dmg` from [GitHub Releases](https://github.com/marcusdiccox/research-buddy/releases/latest), open the disk image and drag **Research Buddy** into **Applications**. The universal bundle contains both Intel and Apple-silicon executables. Open the app from Applications; it lives as a small desktop pet and menu-bar tray companion.

- Click Pip for the small bubble. The first ordinary opening each day shows Today; Notes, Reminder and Calendar remain available.
- Select text, then press **Command+Option+N** to capture it for review. macOS may require Accessibility permission for Pip to read the selected text. Grant that yourself in System Settings if you want selection capture. Otherwise copy text normally and use the tray's **Capture copied text** action. Capture never watches clipboard history.
- The existing pet show/hide shortcut is **Control+Option+P** by default. It is separate from the capture shortcut. Alternative pet shortcuts are in Settings.
- Enable **Open at login** in Settings if you want Pip when you sign in. Closing its note window keeps the pet running. Use the tray's Quit action to stop it.
- Use the update button in Settings for release downloads and replace the app in Applications when ready. Windows uses automatic downloads; this first Mac build uses manual updates.

This build is ad-hoc signed, not Developer ID signed or notarized. macOS may block an unrecognized download; Pip does not change macOS security settings. Official Apple guidance describes [opening apps from outside the App Store](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac). Automatic Mac installation is deferred because [electron-updater requires code signing on macOS](https://www.electron.build/auto-update).

Source builds on a Mac use Node.js 24 or newer: `npm ci`, then `npm run make:mac`. The workflow checks both Mach-O architectures and launches the packaged universal app for the new feature tests. A native-helper ready/shutdown smoke test runs without granting Accessibility. Permission-granted selected-text copying is not tested on a physical Mac.

