# Research Buddy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This request authorizes planning and GitHub setup only; application implementation is a separate step.

**Goal:** Deliver a Windows companion that turns saved company research into cited summaries, scoped answers, and a durable thesis journal.

**Architecture:** A React renderer uses a narrow preload bridge to an Electron application service. The service owns SQLite persistence, scoped retrieval, provider requests, credential protection, and exports; the companion shares that service and generation state. No hosted application backend is required.

**Tech Stack:** Proposed Electron, React, TypeScript, SQLite/FTS5, Vitest, Playwright, Electron Forge. Pin supported versions, choose the SQLite binding and one hosted provider/model in Task 1.

**Spec:** [Product design](../specs/2026-11-03-research-buddy-design.md)

**Status:** Proposed implementation plan for review; no implementation has started.

## Global Constraints

- Windows 11 x64 is the only release target.
- One local user, one SQLite database, no sign-in or hosted application backend.
- Local organization, search, journal editing, and export work offline; generation requires the configured external provider.
- One active generation job globally, a 60-second timeout per provider call, no automatic paid retries, and visible cancel/retry controls.
- Research text in SQLite and exports is ordinary local plaintext. Do not advertise full-database encryption.
- A URL is metadata only in v0.1; the app does not fetch it.
- No telemetry, background scraping, clipboard monitoring, screen capture, trading, or autonomous computer actions.

All additional import limits, token limits, source/journal immutability, citation requirements, consent rules, and renderer security requirements in the spec are mandatory across tasks. Use a fake provider for automated tests; real provider calls are opt-in manual evaluation only.

## Review Focus

1. Packaged native SQLite compatibility and restart persistence: pinned by Task 1 installed-build checks.
2. Foreign-company citations and superficially valid but unrelated quotes: structural tests in Tasks 4/5; semantic support in Task 9's manual evaluation.
3. Unicode, duplicate imports, revised source metadata, and literal FTS punctuation: pinned by Task 2 tests.
4. Cancellation, provider failure, double-clicked submissions, and unavailable credential storage: pinned by Task 3 tests.
5. Export filename collisions and concurrent writes; off-screen companion position after display changes: pinned by Tasks 7/8 checks.

## Proposed file map

| Path | Responsibility |
| --- | --- |
| `src/shared/contracts.ts` | Serializable domain records, bridge payloads, error codes |
| `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts` | Lifecycle, validated IPC, narrow bridge |
| `src/main/db/database.ts`, `src/main/db/migrations/001_initial.sql` | SQLite lifecycle, schema, transactions and FTS5 |
| `src/main/companies/service.ts` | Company operations |
| `src/main/sources/{normalize,chunk,service,search}.ts` | Text import, revisions, deterministic chunks and scoped search |
| `src/main/generation/{credentials,provider,jobs,consent,citations,summary,answer}.ts` | Provider boundary and research generation |
| `src/main/journal/service.ts`, `src/main/export/service.ts` | Immutable journal and snapshot dossier export |
| `src/main/companion.ts` | Companion/tray windows and display placement |
| `src/renderer/features/{companies,sources,research,journal,settings,companion}/` | Feature views and application state |
| `tests/{companies,sources,generation,journal,export,companion}/` | Domain and integration verification |
| `tests/e2e/`, `fixtures/research/` | Electron journeys and synthetic demo/evaluation corpus |
| `forge.config.ts`, `package.json`, `.github/workflows/ci.yml` | Packaging, scripts, CI |

Initial schema includes companies, immutable source revisions, chunks/FTS index, research results, immutable journal revisions, and settings from the spec. Use migrations from the first working slice.

## Shared contract decisions

Define these in `src/shared/contracts.ts` during Task 1 and extend them in the owning task. UUIDs are strings; times are ISO 8601 UTC. Source publication dates are optional ISO calendar dates. Offsets are Unicode code-point offsets into normalized text.

- `Citation = { sourceRevisionId: string; chunkId: string; quote: string }`.
- `Claim = { text: string; kind: 'takeaway' | 'risk'; citations: Citation[] }`.
- `GeneratedResearch = { claims: Claim[]; openQuestions: string[] }`.
- `EvidenceChunk = { companyId: string; sourceRevisionId: string; chunkId: string; text: string; title: string; publishedOn?: string }`.
- `ResearchResult` adds ID, company ID, kind, optional question, source revision IDs, provider/model, prompt version, and timestamp to `GeneratedResearch`.
- `ImportDraft = { companyId: string; title: string; text: string; originalUrl?: string; publishedOn?: string; logicalSourceId?: string }`.
- `JournalDraft = { thesis: string; supportingEvidence: Citation[]; counterarguments: string; invalidationConditions: string }`.
- `JobSnapshot = { id: string; companyId: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; resultId?: string; errorCode?: string }`.
- All bridge requests return a discriminated success/error result with stable error code and user-safe message. Never send stack traces or secrets to the renderer.

## Task 1 / RB-01: Packaged local workspace

**Files:** Create app shell, contracts, database/migration, company service, package/Forge configuration, `tests/companies/service.test.ts`, and `tests/e2e/workspace.spec.ts`.

**Interfaces:** Produce `createCompany(input: {name: string; ticker?: string}): Promise<Company>`, `listCompanies(): Promise<Company[]>`, and `updateCompany(id: string, input: {name: string; ticker?: string}): Promise<Company>`. `Company` contains ID, name, optional ticker, createdAt, updatedAt. DB service accepts an explicit data directory for isolated tests.

- [ ] Write company persistence tests asserting `listCompanies()` contains a created UUID/name after closing and reopening the database; blank names fail and repeated tickers succeed.
- [ ] Establish `npm run test:unit -- tests/companies/service.test.ts` and run it; verify the new behavior fails before implementing persistence.
- [ ] Build the smallest Electron shell, typed allowlisted bridge, SQLite migration, and company list/editor. Enable renderer isolation/sandbox and deny unexpected navigation and IPC senders.
- [ ] Add scripts for `typecheck`, `test:unit`, `test:e2e`, and `make`. Verify company tests pass; run `npm run make` and install the resulting Windows artifact. Create a company, quit, reopen, and verify its data.
- [ ] Record dependency versions, SQLite packaging findings, hosted provider/model selection, and the 16,000-input-token budget feasibility in `docs/architecture/001-desktop-foundation.md`. Commit this working slice.

## Task 2 / RB-02: Immutable research library

**Files:** Create source normalize/chunk/service/search modules and source views; extend contracts/schema; create `tests/sources/import.test.ts` and `tests/sources/search.test.ts`.

**Interfaces:** Consume company IDs from Task 1. Produce `importSource(draft: ImportDraft): Promise<{source: SourceRevision; duplicate: boolean}>`, `reviseSource(sourceRevisionId: string, patch: {title?: string; text?: string; originalUrl?: string; publishedOn?: string}): Promise<SourceRevision>`, `listSources(companyId: string): Promise<SourceRevision[]>`, `getSourceRevision(companyId: string, id: string): Promise<SourceRevision>`, and `searchEvidence(companyId: string, query: string, limit: number): Promise<EvidenceChunk[]>`. Reject requested limits above eight.

- [ ] Write import tests for an empty file, invalid UTF-8, 2 MiB + 1 byte, 100,001 code points, emoji offsets, same-company duplicates, different-company identical content, text revisions, and metadata-only revisions. Assert rejected imports leave no rows; old revision text/metadata stays unchanged.
- [ ] Write search tests asserting punctuation/quotes cannot break MATCH syntax, another company's chunks never return, and every chunk is at most 2,000 code points with correct saved-text offsets. Run `npm run test:unit -- tests/sources`; confirm new tests fail.
- [ ] Implement native file selection and pasted-text preview, decode/normalize LF line endings and remove only a UTF-8 BOM, validate limits, calculate SHA-256, create revisions/chunks/FTS entries in one transaction, and implement parameter-bound literal-term search. Dedupe import by company and normalized content; metadata edits use `reviseSource` explicitly.
- [ ] Build the source list, reading panel, original URL/date metadata, and search UI. Verify `npm run test:unit -- tests/sources` passes and a library-only Electron journey survives restart.
- [ ] Commit the library slice. A user can now organize and search research without a provider.

## Task 3 / RB-03: Provider, consent, and job lifecycle

**Files:** Create credentials/provider/jobs/consent modules, settings UI, and `tests/generation/jobs.test.ts`, `tests/generation/credentials.test.ts`, `tests/generation/consent.test.ts`.

**Interfaces:** Produce `ResearchProvider.generate(input: {system: string; evidence: EvidenceChunk[]; question?: string; signal: AbortSignal}): Promise<GeneratedResearch>`, `startJob(companyId: string, operation: (signal: AbortSignal) => Promise<string>): Promise<JobSnapshot>`, `cancelJob(id: string): Promise<void>`, and `getJob(id: string): JobSnapshot`. The operation returns a persisted result ID; cancelled operations cannot persist results. Provider configuration/consent and credentials remain main-process-only services.

- [ ] Write fake-provider tests asserting two simultaneous starts yield one running job plus a busy error; a 60-second fake-clock timeout aborts; cancellation before result commit prevents a saved result; and invalid keys, 429, malformed output, and offline errors cause no automatic retries.
- [ ] Write tests asserting endpoint/model changes clear consent, a first request cannot run without consent, protected-storage failure permits session-only keys, and renderer payloads/log captures contain neither keys nor research content. Run `npm run test:unit -- tests/generation`; confirm failures for missing behavior.
- [ ] Implement the selected provider adapter, structured response schema, OS-protected/session-only credential storage, consent service, model-compatible input-token budgeting capped at 16,000, main-process job serialization, abort/timeout handling, and safe error mapping. Verify response size limits against the selected model and record them in the architecture decision.
- [ ] Implement configuration, scope preview, connection check, cancel, and explicit retry controls. Retry starts a new request only after a user action. Verify the generation tests and one opt-in provider connection check without logging payloads.
- [ ] Commit the generation infrastructure. Subsequent tasks use this single request path.

## Task 4 / RB-04: Cited source summaries

**Files:** Create citations/summary modules, research views, `tests/generation/citations.test.ts`, and `tests/generation/summary.test.ts`.

**Interfaces:** Consume Tasks 2/3. Produce `validateResearch(output: GeneratedResearch, evidence: EvidenceChunk[]): GeneratedResearch` (throws a typed validation error), `summarizeSource(companyId: string, sourceRevisionId: string): Promise<JobSnapshot>`, `getResearchResult(companyId: string, id: string): Promise<ResearchResult>`, and `listResearchResults(companyId: string): Promise<ResearchResult[]>`.

- [ ] Write validation tests: uncited claims, empty quotes, unknown chunks, foreign-company revisions, and quotes absent from the saved chunk are rejected; exact allowed quotes pass. Add a reminder assertion/test name that quote presence alone is not semantic entailment.
- [ ] Write summary tests using a 17-chunk source: all chunks are processed in batches no larger than eight, every provider call respects the token cap, final citations resolve to original chunks, and cancellation during aggregation saves nothing. Run the two new test files and confirm failures.
- [ ] Implement bounded map/aggregate summarization; recursively reduce if intermediate claims exceed one request's token budget. Keep citation IDs/quotes from original evidence, never cite generated intermediate text. Validate structured claims before committing one final immutable result after a cancellation check.
- [ ] Render takeaways, risks, open questions, provenance, and source dates. Citation clicks open/highlight exact saved text via `getSourceRevision`; **Regenerate** creates a new result. Verify all generation tests and an Electron summary→citation journey with the fake provider.
- [ ] Commit cited summaries. Keep unsupported items as unanswered questions, not unsupported factual claims.

## Task 5 / RB-05: Company-scoped questions

**Files:** Create answer module and Ask view; create `tests/generation/answer.test.ts` and extend `tests/e2e/research.spec.ts`.

**Interfaces:** Consume `searchEvidence`, job/provider services, citation validation and result persistence. Produce `answerQuestion(companyId: string, question: string): Promise<JobSnapshot>`; return results through Task 4 retrieval APIs.

- [ ] Write tests for an answerable question, no matched evidence, unsupported answer with empty claims/open question, conflicting dated evidence, hostile source instructions, and an attempted other-company citation. Assert at most eight retrieved chunks and no provider call when retrieval is empty.
- [ ] Run `npm run test:unit -- tests/generation/answer.test.ts`; confirm failing behavior before implementation.
- [ ] Implement literal-term retrieval, bounded evidence preview, source-only instruction template, citation validation, and persisted question/result provenance. Missing evidence states “not found in the retrieved sources”; show that retrieval is not exhaustive. Do not give the provider tools or URL-fetch access.
- [ ] Add question entry, progress/cancel, answer display and citation reuse. Verify the unit suite and the Electron ask→evidence journey; manually inspect conflicting sources with the configured provider later in Task 9.
- [ ] Commit scoped questions.

## Task 6 / RB-06: Thesis journal history

**Files:** Create journal service/views, extend contracts/schema, and create `tests/journal/service.test.ts`.

**Interfaces:** Produce `createJournalEntry(companyId: string, draft: JournalDraft): Promise<JournalRevision>`, `reviseJournalEntry(companyId: string, entryId: string, draft: JournalDraft): Promise<JournalRevision>`, and `listJournalHistory(companyId: string, entryId: string): Promise<JournalRevision[]>`. Revision IDs and timestamps are immutable; entry IDs group revisions.

- [ ] Write tests asserting editing appends a revision, old text/time/evidence survive restart, foreign-company evidence fails, and newly imported source revisions do not redirect older evidence references.
- [ ] Run `npm run test:unit -- tests/journal/service.test.ts`; confirm failures.
- [ ] Implement journal transactions and validated evidence references. Add thesis, evidence, counterarguments, invalidation conditions, and history views. Copying a generated claim into a journal requires an explicit action and editable preview.
- [ ] Verify journal tests and a UI create→revise→inspect-original→restart journey. A failed save must preserve the draft and old persisted revision.
- [ ] Commit journal history.

## Task 7 / RB-07: Portable research dossier

**Files:** Create export service/UI, `tests/export/service.test.ts`, and a checked synthetic golden export fixture.

**Interfaces:** Produce `exportCompany(companyId: string, destinationDirectory: string): Promise<{directory: string; files: string[]}>`; obtain destination through a main-process native picker. Consume company, sources, results, and complete journal history through one consistent database read snapshot.

- [ ] Write tests for two identical source titles, reserved Windows filenames, `../` in a title, existing destination content, Unicode names, source updates during export, and interrupted writes. Assert every relative citation target exists and no credentials or internal absolute paths appear.
- [ ] Run `npm run test:unit -- tests/export/service.test.ts`; confirm failures.
- [ ] Implement snapshot export into a fresh staging directory, stable ID-based safe filenames, Markdown index/results/history, and source text with citation anchors. Finalize only after all writes succeed; do not overwrite an existing dossier or unrelated content.
- [ ] Verify export tests and open the synthetic dossier outside the app. Check quotes, publication/import dates, model provenance, and every citation link. Document that import/restore from this dossier is outside v0.1.
- [ ] Commit export.

## Task 8 / RB-08: Desktop companion

**Files:** Create companion lifecycle/state/placement module and renderer, add character state assets, create `tests/companion/placement.test.ts`, and `tests/e2e/companion.spec.ts`.

**Interfaces:** Consume the existing job state. Produce `showCompanion(): void`, `hideCompanion(): void`, `restoreWorkspace(): void`, and `clampPosition(position: {x: number; y: number}, size: {width: number; height: number}, workAreas: Array<{x: number; y: number; width: number; height: number}>): {x: number; y: number}`. Preferences persist through the existing settings service.

- [ ] Write placement tests for negative-coordinate monitors, monitor removal, changed work area, and an off-screen stored position. Add lifecycle checks for close-to-tray, tray restore/quit, persisted visibility, idle non-focus behavior, and job continuation while hidden.
- [ ] Run placement tests and the new Electron smoke checks; confirm failures.
- [ ] Implement the movable companion with idle/thinking/error artwork, click-to-workspace, tray actions, and companion-only always-on-top preference. Reuse real job state; avoid a second chat implementation or idle polling loop.
- [ ] Verify automated checks; manually drag between two displays and remove one display. Record idle CPU/memory on the test machine as a baseline rather than claiming an unmeasured resource target.
- [ ] Commit companion.

## Task 9 / RB-09: Demo and Windows release

**Files:** Create synthetic corpus/demo responses, `.github/workflows/ci.yml`, `tests/e2e/release.spec.ts`, `docs/quality/release-checklist.md`, and update `README.md`.

**Interfaces:** Add an explicitly labeled demo provider implementing the Task 3 interface; it uses only fixture evidence and returns deterministic valid citations. Demo mode blocks outbound requests rather than relying on the absence of a key.

- [ ] Write the end-to-end fixture journey: create company→import two sources→summary→citation→question→journal revision→export→restart. Assert demo mode sends zero network requests and every exported citation resolves. Run it and confirm the missing demo/release behavior fails.
- [ ] Implement synthetic demo mode, test workflow, and Windows package smoke check. CI runs `npm ci`, `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, and `npm run make` with pinned dependency locks.
- [ ] Run those checks and install the produced build on a clean Windows 11 x64 machine. Record versions, results, artifact path, and signing status. Record any unresolved release blocker; a generated installer alone is not proof it runs.
- [ ] Evaluate ten synthetic scenarios using the real selected model, recording expected evidence, actual claims/citations, unanswered questions, and pass/fail. Include unsupported evidence, contradictions, stale dates, instructions embedded in sources, revised sources, and company isolation. Critical unsupported claims block release.
- [ ] Finish README/GIF, architecture notes, provider/local-plaintext disclosure, platform and import limits, explicit no-delete/no-backup-restore limitations, and dependency/license review. Choose a project license before publishing a release. Commit the release-ready documentation and fixtures.

## Handoff

The epic tracks these nine tasks and their acceptance criteria. The first implementation step is Task 1's packaged vertical slice; resolve provider and SQLite feasibility before building the full feature set. Review the proposed design/technical defaults before starting product code. This planning delivery does not claim any application tests, installer, or live-model evaluation have run.
