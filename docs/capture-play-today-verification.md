# Capture, play, Today and Mac release verification

Released November 27, 2026 as [Pip 0.10.0](https://github.com/marcusdiccox/research-buddy/releases/tag/v0.10.0). Runtime source: `7bd4b98b7fc9e403f2a68c1a01df4622d5a6fabf`.

## Behavior and review

Quick capture, treats/ball play, Today and No jokes implement the approved design. A subsequent user request added universal Mac packaging, login startup and a Mac selected-text helper. Captured text and existing draft whitespace remain exact, within the bounded note limit. Windows verifies clipboard owner/process and a stable read. Mac reads the accessible selected-text attribute and verifies the same focused element/window; unsupported or unpermitted selections use the explicit copied-text fallback.

An independent whole-branch review found draft navigation/identity, capture conversion, Today status, validation bounds/whitespace, selection provenance and Mac startup issues. All material findings were fixed. Four UI regressions and bounded validation/activation tests were observed failing before passing. A controlled background clipboard writer reproduced unrelated-text capture against the earlier helper; the fixed helper rejects it. Today tab visits, failed capture delivery recovery and packaged Mac helper readiness were also addressed. No review findings remain deferred.

## Checks

- 251 backend tests, TypeScript and build passed locally and on both hosted platforms.
- [Hosted run 45945548897](https://github.com/marcusdiccox/research-buddy/actions/runs/45945548897) passed all 66 Windows desktop tests and Windows packaging. The universal Mac binary passed `lipo` validation for arm64 and x86_64, packaging, nine feature tests and one native-helper ready/shutdown smoke test. The permission-granted Mac selected-text test is skipped; Mac Accessibility permissions and physical Intel hardware were not exercised.
- All 11 focused desktop/native cases passed locally. The complete local run passed 65/66; the remaining native copy probe could not acquire foreground from the already-running installed Pip. Diagnostics confirmed the old production PID remained foreground, so the safe fallback fired. A separate Computer Use test explicitly activated a fictional scratch document and used the actual Ctrl+Alt+N shortcut: `A small idea worth keeping 🦊` arrived in the isolated note bubble with `Captured · review and save`. No personal document was used for capture tests.
- The final packaged Windows app passed all nine new feature UI tests. Fictional-profile Today, settings and treat screenshots were visually inspected; compact controls fit their windows.
- All 5,026 packaged files passed embedded SHA-256 checks. Main, companion, capture, activation, Today and preload modules match the compiled build. Both platform manifests' sizes and SHA-512 hashes match their artifacts. All eight uploaded GitHub SHA-256 digests match local files.

## Release files

| File | SHA-256 |
| --- | --- |
| Pip-Setup-0.10.0.exe | F18D3561713FF19BDA09B11F60CF410BD19DBB7E26ADCF31630F24FEEDDD1FE2 |
| Pip-0.10.0-mac-universal.dmg | 893798656977CD6653178E45762F3CEA80A73DC758B1FFA5990954BCF85833CD |
| Pip-0.10.0-mac-universal.zip | AE4EADFAA4389798E1BA33F07F3E480BB0ECABEC643214C8FB2867801FBB586F |

The Windows installer is unsigned. The Mac build is ad-hoc signed and not notarized; Mac updates open release downloads until Developer ID signing is configured. Windows automatic download/install-on-quit behavior remains enabled.

## Installed copy

Computer Use checked the old installed note: empty, Save disabled, and Start focus available. A consistent database snapshot was taken before installation. Pip 0.10.0 is installed and running from the normal per-user Programs directory; saved notebook records match the backup. Computer Use confirmed the installed Today/Notes/Reminder/Calendar interface. The capture worker is running under the installed application. No production note or active focus session was interrupted.

Implementation choices: used the existing dedicated feature branch/workspace and inline execution; no additional worktree was created. Mac uses Accessibility selected text rather than an unverified clipboard change; apps without that attribute require the copied-text action. Supporting those apps through another selection mechanism is future work.
