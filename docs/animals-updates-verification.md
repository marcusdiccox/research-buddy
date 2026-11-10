# Animals and automatic updates — November 10, 2026

Version 0.9.0 adds red panda/otter choices, independent Animal/Appearance settings and all nine species/color combinations. Five generated transparent 4x4 atlases cover base movements, sit/sleep/wake transitions and otter swim/float actions. A cleanup edit pass, runtime alpha testing and baseline alignment keep the tiny characters crisp. Prompt provenance is in assets/red-panda/README.md and assets/otter/README.md.

Movement tests cover swim enter/exit, slow position changes, monitor boundaries, hover pause, reduced motion, species-only swim poses and waking before play. The new species retain the shared generic joke pool and add their own lines; fox-specific lines are filtered out for them. Settings do not grow beyond the previous 340x400 native window.

Updates use electron-updater 6.8.11 and the fixed public marcusdiccox/research-buddy release feed. Installed Windows builds check after startup/every six hours, download in the background and install on normal quit. Windows session-end events defer installation. Test/dev/unpacked builds cannot auto-download/install. No renderer-supplied feed URL or GitHub token is accepted. Version-tag publishing uploads installer, blockmap and manifest together after Windows checks and preserves existing releases.

232 backend tests, TypeScript/build checks and workflow YAML parsing passed. A full packaged run passed 48 desktop journeys. After the final animal-identity wording cleanup, the rebuilt installer passed all five affected animal/settings journeys, covering all nine colors, sprite cells, baseline alignment, persistence, play actions, compact sizing and update-test isolation. The remaining full coverage also runs on hosted Windows before publication.

Independent review found an unhandled automatic-download promise: electron-updater returns availability and download promises separately. A regression was observed failing, the controller now consumes both, and the whole unit suite passes. This prevents offline download rejection from escaping the main-process controller.

The final archive passed embedded SHA-256 checks for all 5,017 files and matches the compiled main/preload/update/behavior modules. latest.yml's SHA-512 and byte size match the installer; app-update.yml pins the intended GitHub owner/repository. Installer SHA-256: B835C0DFE760F32B0311161940622EA1C82D4CB3152E3ECCC2B84078DB5943CB.

Hosted Windows run 42910283252 passed all 232 backend tests, all 48 desktop journeys and installer packaging before publication. All three uploaded GitHub asset hashes matched the local release files.

After publication, an isolated electron-updater adapter reporting version 0.8.1 found the real public 0.9.0 release, downloaded its complete installer and independently verified SHA-512 against the manifest. Installation was disabled throughout that probe. Its adapter/cache did not use the production profile.

With no production Pip process running, backed up the existing notebook, installed the tested 0.9.0 installer and confirmed the installed archive matches the tested package. Launched the stable installed executable; it reported version 0.9.0 and its live automatic check reported latest 0.9.0 with downgrade disallowed. Existing saved notes/projects/journal were unchanged, a daily backup was created, and the Windows startup entry remained enabled. An actual unattended version-to-version installer execution is not claimed; the real feed/download/checksum and installed-app check are verified. Earlier versions need one manual installation of 0.9.0. Windows code signing remains unconfigured.
