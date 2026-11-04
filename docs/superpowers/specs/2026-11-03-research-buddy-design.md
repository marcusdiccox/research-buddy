# Research Buddy — product design

Status: implementation started following the user's instruction to build. The additions below extend the original research scope.

## Implementation additions requested by the user

- A cute companion and plain-language interface suitable for someone without technical experience.
- Persistent reminders with a local date/time picker, event duration, desktop notifications while the app is running, overdue recovery on launch, snooze and complete/reopen controls. Reminders do not wake a powered-off machine; closing the window keeps the app in the tray, while Quit stops notifications.
- **Add to Google Calendar** opens Google's documented event editor with the saved reminder prefilled. The user reviews and clicks Save in their browser. This is intentionally described as a calendar action, not an account connection, sync, or automatic insertion.
- `.ics` export supports Google Calendar, Outlook, Apple Calendar and other calendar apps without developer credentials.
- Local Quick summary selects important verbatim passages and always works without a key. Matching-passage questions are labeled honestly. Hosted AI is optional and must remain distinguishable from local extraction.
- Use modern Electron's built-in `node:sqlite` after a runtime packaging check, and electron-builder for Windows distribution. These replace the original native-driver/Forge proposals.

## Intent

Build a Windows desktop companion that helps a person organize company research, understand their own material, and record how their investing thesis changes. A small character stays nearby; clicking it opens a useful research workspace.

The defining feature is traceability: a generated point opens the exact saved passage behind it. Personality makes the app inviting; the research workflow gives it a reason to exist.

## Proposed first-release experience

1. Create a company workspace with a name and optional ticker.
2. Add a Markdown/text file or paste research, with an optional original URL and publication date.
3. Preview the imported text and choose **Summarize**. Before the first provider request, show which configured service receives the selected material and obtain consent.
4. Read a brief with supported takeaways, risks, and open questions. Click a citation to see the saved passage, source title, and date.
5. Ask a question within the active company's sources; inspect the evidence or see that the available sources do not answer it.
6. Write a dated thesis with supporting evidence, counterarguments, and what would change your mind.
7. Export that research to Markdown. Reopen the app later with the company, sources, and journal intact.

Example demo: import two fictional reports for Aster Devices, summarize the changed demand outlook, inspect the conflicting passages, and save a thesis revision. Use synthetic material in the public demo.

## Approaches considered

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| Electron desktop app with React and TypeScript | Desktop companion and workspace in one language; conventional desktop packaging | Larger runtime; native SQLite packaging needs an early check |
| Tauri desktop app with React | Good fit for a small desktop shell | Adds Rust and plugin integration to the learning scope |
| Browser app first | Simplest initial distribution | Does not deliver the persistent desktop character that motivated the idea |

**Author's proposed default:** Electron, React, TypeScript, SQLite with FTS5, Vitest, Playwright, and Electron Forge. These are proposals, not choices the user has already approved. Lock supported versions and a compatible SQLite binding during the first implementation task. Start with Windows 11 x64; macOS and Linux are later work.

## First-release scope and constraints

- Windows 11 x64 is the only release target.
- One local user, one SQLite database, no sign-in or hosted application backend.
- Local organization, search, journal editing, and export work offline; generation requires the configured external provider.
- Import UTF-8 `.txt`, `.md`, or pasted text. Reject empty input, invalid UTF-8, files above 2 MiB, and text above 100,000 Unicode code points; do not silently truncate.
- Source title, original URL, publication date, and import timestamp are stored separately. Publication date may be unknown; it must not be inferred from import time.
- A URL is metadata only in v0.1; the app does not fetch it.
- Reimporting identical normalized content into the same company returns the existing source. Changed content creates a new immutable source revision.
- Each source is divided into deterministic paragraph-based chunks of at most 2,000 Unicode code points, splitting long paragraphs at the limit. Store offsets into normalized source text.
- Questions search only the active company using SQLite FTS5. Retrieve at most eight chunks. A summary uses all chunks from one selected source; process them in batches of at most eight and aggregate cited intermediate results. Never silently skip chunks.
- Generated output is structured into claims and unanswered questions. Every claim has at least one citation; unsupported assertions must not be displayed as supported claims.
- A citation contains `sourceRevisionId`, `chunkId`, and an exact quote. Validate that it belongs to the request's evidence and that the quote is a substring of the saved chunk. This validates provenance, not whether the quote logically proves a claim; manual quality evaluation remains necessary.
- Before a request, show its source scope; obtain consent per provider configuration. Changing the endpoint or model clears consent. Cancellation makes partial output unsavable; retries require an explicit user action.
- Generated answers include provider/model, generation time, source revision IDs, and prompt version. New sources do not update old answers automatically; provide a **Regenerate** action.
- One active generation job globally, a 60-second timeout per provider call, no automatic paid retries, and visible cancel/retry controls.
- v0.1 supports one hosted provider. Choose it during Task 1 using structured-output support, current context limits, cost, and a Windows smoke test; record the choice in an architecture decision. Select the model before validating the 16,000-input-token request budget, including instructions and evidence; split or reject oversized requests visibly.
- Keep API credentials outside the renderer and database; use the operating system's protected storage through Electron's available safeStorage API. If protected storage is unavailable, allow session-only credentials.
- Research text in SQLite and exports is ordinary local plaintext. Do not advertise full-database encryption.
- Do not log research content or credentials. No telemetry, background scraping, clipboard monitoring, screen capture, trading, or autonomous computer actions.
- Render source text as text, not executable HTML. Renderer uses `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and a narrow validated preload bridge. Deny unexpected navigation and IPC senders.
- Imported material is untrusted evidence, never instructions or permission to run tools. The generation path has no tools or arbitrary URL-fetch capability.
- The companion supports drag, show/hide workspace, tray hide/restore/quit, and idle/thinking/error states. It has no roaming animation or voice in v0.1. Keep its position on an available display after resolution changes or monitor removal.
- A workspace exit quits the application; closing its window hides it to tray. Companion visibility and position persist across restarts. Always-on-top applies to the companion only and is user-toggleable.
- Local export is a directory containing readable Markdown and source text with relative citation links. Include sources, generated answers and provenance, journal history, and company metadata; exclude credentials and internal filesystem paths. Export is not a backup/restore format in v0.1.

## Research workspace

Use a company list, a source list, and a main reading area with Summary, Ask, and Journal views. A citation opens a passage panel beside the result without losing reading position. Show publication date or “Date unknown” so old material cannot look like current market data.

Use a small static character with a few visual states. The companion opens the same workspace and shows the real generation state. Do not implement a separate chat system for it.

## Data and boundaries

All database changes and provider calls happen behind the main-process application service. The renderer receives typed, serializable results. File selection happens through a native picker; renderer code cannot supply arbitrary paths. The SQLite driver may live in a worker if needed for responsiveness; this is a builder decision.

| Record | Required information |
| --- | --- |
| Company | UUID, display name, optional ticker, created/updated timestamps |
| SourceRevision | UUID, company ID, logical source ID, title, normalized text, SHA-256, optional URL/publication date, import timestamp, revision number |
| Chunk | UUID, source revision ID, ordinal, start/end offsets, normalized text |
| ResearchResult | UUID, company ID, summary/answer kind, optional question, claims/citations, unanswered questions, model/provider, prompt version, timestamp, source revision IDs |
| JournalRevision | UUID, entry ID, company ID, written time, thesis, supporting evidence references, counterarguments, invalidation conditions, optional superseded revision ID |
| Settings | Companion visibility/position, always-on-top preference, provider configuration and consent version; no API key |

Source and journal revisions are append-only. Saving edits to a journal creates a new revision. Updating source metadata also creates a revision; citations keep the original metadata and text. Company/source deletion and full backup/restore are deferred; make that limitation clear in the README.

Summaries and journal entries are separate records. Saving an AI response into a thesis must be an explicit user action. Currency figures and dated claims come from source passages; no live price or valuation is implied.

## Milestones

1. **Local research library:** packaged vertical slice, companies, text import, durable sources, search.
2. **Evidence-backed research:** provider configuration, validated summaries and questions, citation viewer, failure/cancellation states.
3. **Desktop companion release:** journal history, Markdown export, companion, Windows installer, offline synthetic demo and release checks.

Defer PDF/OCR and automatic URL import, live quotes/charts, SEC/earnings ingestion, alerts, embeddings, local model integration, cloud sync, voice, plugins, trading, and complex character animation. Live-data work later needs explicit provider licensing, timestamps, and stale-data behavior.

## Definition of done

- A clean Windows 11 x64 machine can install and complete the example workflow.
- All displayed generated claims have mechanically valid citations. Manual review of ten synthetic scenarios finds no critical unsupported claims; record the model and outcomes.
- Fixtures cover an answerable question, missing evidence, contradictory dated sources, duplicate imports, source revisions, hostile source instructions, network failure, timeout, cancellation, and unavailable credential storage.
- Company isolation holds in search, generation evidence, citations, journal references, and export.
- Restart preserves sources, results, journal history, and companion preferences.
- A user without an API key can complete a clearly labeled synthetic demo; demo mode never uses the network.
- CI runs type checks, meaningful automated tests, and a Windows packaging smoke check. Installer checks also run manually outside the development environment.
- README contains setup, demo instructions, screenshots/GIF, architecture, local-data/provider disclosure, supported platform, and known limitations. Choose an open-source license before publishing.

## Decisions left to the builder

Choose maintained dependency versions, SQLite binding and migration tooling, the first hosted provider/model, exact styling and character artwork, and installer signing/distribution options. Preserve all observable behavior and limits above. Validate native packaging early; do not change the platform or product scope silently if the spike fails.

## Technical references

- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security): basis for renderer isolation and validated privilege boundaries.
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): OS-backed credential protection; Windows protection is tied to the user account and does not isolate secrets from every app run by that user. Verify the API in the locked Electron version.
- [SQLite FTS5](https://www.sqlite.org/fts5.html): local full-text retrieval; use parameter binding and quote user search terms instead of exposing raw FTS syntax.
