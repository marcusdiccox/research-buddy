# Epic: Research Buddy v0.1 — a desktop companion for company research

**Status:** Draft, ready to copy into a GitHub issue. This is not a published issue.
**Suggested labels:** `epic`, `v0.1`, `desktop`, `research` (create only if useful in the destination repository).
**Milestone:** First usable Windows release.
**Design:** [Product design](../superpowers/specs/2026-11-03-research-buddy-design.md)
**Implementation plan:** [Task plan](../superpowers/plans/2026-11-03-research-buddy.md)

## Problem

Company research gets scattered across notes, reports, and chat histories. Summaries can lose the supporting evidence, and it becomes hard to remember why a thesis changed. Research Buddy puts sources, cited answers, and a dated journal in one local desktop workspace, accessible through a small on-screen companion.

## Outcome

As someone researching a company, I can collect material, understand it with source-linked AI assistance, and record my own reasoning so I can revisit both the conclusion and the evidence later.

**Demo moment:** drop in two fictional company notes, ask “What changed in the demand outlook?”, click the evidence, save a thesis revision, and export the research.

## Scope

- Windows 11 x64 desktop application with a movable companion and a full research workspace.
- Company workspaces, UTF-8 text/Markdown and pasted-text import, durable local storage, company-scoped search.
- One configurable hosted AI provider; cited source summaries and company-scoped questions.
- Dated thesis journal with immutable revision history and Markdown export.
- A synthetic offline demo, CI, Windows packaging, and a README with a short demo GIF.
- Approachable reminder creation, snooze/completion, desktop notifications, Google Calendar event drafts, and `.ics` event export (added when implementation was requested).

Later: PDF/OCR, fetching links, market feeds, alerts, SEC integrations, local models, sync, voice, trading, and elaborate animation.

## Proposed technical direction

Electron + React + TypeScript; SQLite/FTS5 for local persistence and retrieval; Vitest and Playwright for verification; Electron Forge for Windows packaging. Validate the provider, SQLite binding, and packaging in RB-01 before committing to the rest of the build. These choices are proposed defaults.

## Child issue checklist

The RB identifiers are planning IDs, not GitHub issue numbers. Replace them with issue links when the destination repository is known.

- [ ] **RB-01 — Deliver a packaged local workspace vertical slice**
- [ ] **RB-02 — Import and find company research**
- [ ] **RB-03 — Configure generation and protect credentials**
- [ ] **RB-04 — Generate summaries with inspectable citations**
- [ ] **RB-05 — Ask questions across one company's sources**
- [ ] **RB-06 — Keep a thesis journal with history**
- [ ] **RB-07 — Export a readable research dossier**
- [ ] **RB-08 — Add the desktop companion and tray controls**
- [ ] **RB-09 — Ship a demonstrable Windows release**
- [ ] **RB-10 — Add persistent reminders and calendar actions**

## Child issue specifications

### RB-01 — Deliver a packaged local workspace vertical slice

**Priority:** P0 · **Depends on:** none · **Effort:** 2–3 focused days

As a user, I can create a company and reopen it after restarting the installed app.

- [ ] Electron/React/TypeScript workspace runs with isolated renderer and a validated preload bridge.
- [ ] SQLite migrations run on a fresh database; company create/list/update survives restart. Duplicate tickers are allowed because ticker is optional metadata, not a global identifier.
- [ ] An installed Windows build loads the database with the chosen SQLite binding.
- [ ] A short architecture decision records pinned versions, packaging findings, hosted provider/model choice, and validated request budget. No source content is sent during startup.

### RB-02 — Import and find company research

**Priority:** P0 · **Depends on:** RB-01 · **Effort:** 2–3 focused days

As a user, I can add research, preserve the original passage, and find it within a company.

- [ ] Accept `.txt`, `.md`, and pasted UTF-8 text; title and optional original URL/date remain editable through new immutable revisions.
- [ ] Preview text before import. Reject empty/invalid input, files over 2 MiB, and text over 100,000 Unicode code points without partial saves.
- [ ] Same-company duplicate content returns the existing source; changed content creates a revision and preserves earlier citations.
- [ ] Deterministic chunks, stored offsets, and literal-term FTS5 search return only the active company's sources. Dates distinguish publication from import.
- [ ] Unicode, hostile HTML, punctuation-heavy search, and duplicate/revision fixtures pass.

### RB-03 — Configure generation and protect credentials

**Priority:** P0 · **Depends on:** RB-01 · **Effort:** 2–3 focused days

As a user, I can choose when my selected material is sent to the configured provider and recover from generation failures.

- [ ] Provider/model configuration, connection check, and first-use consent work; endpoint/model changes clear consent.
- [ ] API key stays in the main process and OS-protected storage; unavailable protection offers session-only use.
- [ ] Requests declare source scope, enforce the 16,000-input-token budget with a compatible tokenizer or conservative verified bound, and allow one active job globally.
- [ ] Per-call timeout is 60 seconds; cancel, explicit retry, invalid key, rate limit, and network errors leave no savable partial result. There are no automatic paid retries.
- [ ] The renderer cannot read credentials or call arbitrary privileged methods. Logs and exports omit credentials and research text.

### RB-04 — Generate summaries with inspectable citations

**Priority:** P0 · **Depends on:** RB-02, RB-03 · **Effort:** 2–3 focused days

As a user, I can summarize a selected source and inspect the passage behind each generated claim.

- [ ] Summary covers supported takeaways, risks, and open questions; sources larger than eight chunks are processed in bounded batches and cited aggregation.
- [ ] Every displayed claim references an allowed source revision/chunk and an exact quote; invalid structured output fails visibly instead of appearing as supported research.
- [ ] Clicking a citation opens the correct saved revision and highlights the passage.
- [ ] Save source scope, model/provider, generation timestamp, and prompt version; **Regenerate** creates a new result.
- [ ] Tests distinguish valid provenance from semantic support; manual evaluation checks whether quotes actually support claims.

### RB-05 — Ask questions across one company's sources

**Priority:** P0 · **Depends on:** RB-04 · **Effort:** 2–3 focused days

As a user, I can ask a question about my saved research and see what the available evidence supports.

- [ ] Retrieve up to eight chunks from the active company and display the evidence scope. Explain that the answer covers retrieved passages, not an exhaustive analysis of every source.
- [ ] Reuse the same citation validation and viewer as summaries; other-company evidence is rejected.
- [ ] Missing evidence produces an explicit “not found in the retrieved sources” outcome, not an invented answer.
- [ ] Conflicting dates/figures remain attributed to their respective sources; show both sides when both appear in retrieved evidence.
- [ ] Prompt-injection fixtures cannot trigger tool calls, URL fetching, or wider evidence access.

### RB-06 — Keep a thesis journal with history

**Priority:** P0 · **Depends on:** RB-04 · **Effort:** 1–2 focused days

As a user, I can record my thesis, counterarguments, evidence, and conditions that would change my mind.

- [ ] Create and revise journal entries with an immutable timestamped history.
- [ ] Evidence links resolve to the original source revision and belong to the same company.
- [ ] Generated content enters a journal only after an explicit user action; original journal content remains available.
- [ ] Restart and source-revision tests preserve older entries and evidence links.

### RB-07 — Export a readable research dossier

**Priority:** P0 · **Depends on:** RB-05, RB-06 · **Effort:** 1–2 focused days

As a user, I can read my research outside the app and put a synthetic example in a GitHub repository.

- [ ] Export a company directory with Markdown index, source text, generated results/provenance, and complete journal revision history.
- [ ] Relative citation links resolve without the app. Export a consistent database snapshot so concurrent changes cannot break links.
- [ ] Sanitize filenames, avoid path traversal/collisions, and request a new destination rather than overwriting unrelated files.
- [ ] API keys, provider consent secrets, and internal absolute paths never appear in output. Export is documented as a dossier, not a restore backup.

### RB-08 — Add the desktop companion and tray controls

**Priority:** P0 · **Depends on:** RB-03, RB-04 · **Effort:** 2–3 focused days

As a user, I can keep a small helper nearby and open my research without leaving a large window on screen.

- [ ] Draggable character opens the existing workspace and reflects idle/thinking/error states.
- [ ] Hide/restore/quit works from the tray. Closing the workspace hides it; **Quit** exits all windows and processes.
- [ ] Position, visibility, and companion-only always-on-top preference survive restart; monitor removal restores an accessible position.
- [ ] Companion does not steal focus while idle or monitor the screen/clipboard; hiding it does not lose a running job.

### RB-09 — Ship a demonstrable Windows release

**Priority:** P0 · **Depends on:** RB-01 through RB-08 · **Effort:** 2–3 focused days

As a visitor to the GitHub repository, I can understand the project quickly, try the demo, and install a working build.

- [ ] Synthetic fixtures support a clearly labeled offline demo without a key or network access.
- [ ] CI runs type checks, unit/integration tests, Electron smoke tests, and Windows packaging.
- [ ] A clean Windows machine completes install → import → summary → cited answer → journal revision → export → restart.
- [ ] Record ten manual evidence-quality scenarios, including missing and contradictory evidence; no critical unsupported claims remain.
- [ ] README includes setup, GIF/screenshots, architecture, supported platform, source-date caveats, provider/local-data disclosure, and limitations. Choose the license before publishing; no license choice is implied here.
- [ ] Signing and release-channel decisions are recorded; do not describe an unsigned build as signed.

### RB-10 — Add persistent reminders and calendar actions

**Priority:** P0 · **Depends on:** RB-01 · **Effort:** 2–3 focused days

As a user, I can set a reminder in plain language, receive it while Research Buddy runs, snooze or complete it, and create a calendar event without setting up developer credentials.

- [ ] Save a title, optional notes, local date/time and 5–1,440-minute duration. Persist changes and validate dates.
- [ ] Notify once when due while running; recover overdue reminders on launch, retain them in the UI, and support 15-minute snooze plus complete/reopen.
- [ ] **Add to Google Calendar** opens a prefilled event in the signed-in browser; explain that Save in Google completes event creation. Do not claim that an account is connected or synced.
- [ ] Export a standards-compatible `.ics` event with escaped content, UTF-8 line folding and explicit UTC timestamps.
- [ ] Explain tray/quit behavior and notification limits in the app. Test persistence, duplicate-notification prevention, snooze, invalid dates and calendar content injection.

## Delivery order and estimate

1. **Library:** RB-01 → RB-02.
2. **Research:** RB-03 → RB-04 → RB-05.
3. **Personal workflow:** RB-06 → RB-07.
4. **Companion and release:** RB-08 → RB-09.

RB-03 can follow RB-01 before RB-02 if provider feasibility is the largest uncertainty. RB-06 and RB-08 can start after RB-04; RB-10 can follow RB-01. The order above assumes one builder and minimizes context switching.

Original nine-issue planning estimate: **16–25 focused engineering days**, plus **2–3** for reminders/calendar. This excludes learning time, paid service setup, signing procurement, and unexpected packaging issues. Re-estimate after RB-01; this is not a calendar commitment. Ship the local library milestone first to get feedback before completing every AI feature.

## Epic acceptance criteria

- [ ] All ten child issues meet their acceptance criteria.
- [ ] The end-to-end demo works with synthetic data, with and without a configured provider.
- [ ] No displayed generated claim lacks a valid citation; manual review finds no critical evidence-support failure.
- [ ] Company isolation, source/journal immutability, and restart persistence pass automated checks.
- [ ] Provider transmission is explicit; local-only actions and demo mode make no outbound requests.
- [ ] A Windows release artifact and a useful README are ready for publication.

## Risks to resolve early

| Risk | Response |
| --- | --- |
| Native SQLite module breaks in packaged Electron | Installed-build spike in RB-01 |
| Valid-looking citations do not support the claim | Exact-quote validation plus manual evidence-quality scenarios |
| Context overflow or unexpected provider charges | Bounded evidence, token budget, visible scope, explicit retries |
| Companion absorbs effort before research works | Basic state images only; RB-08 follows a working citation workflow |
| Notes are mistaken for current market data | Preserve source dates; no implied live quotes |

## Publishing note

Requested destination: `marcusdiccox/research-buddy`, a new repository. The local Git repository and first working application exist. Publication is pending the user's chosen account switch: both GitHub connections still report `CltadeI`, which cannot create a repository owned by the separate personal account `marcusdiccox`. This file is the complete epic draft; replace RB IDs with returned issue numbers after publication.
