# Compact Notepad and Calendar Implementation Plan

> Execute independent renderer and pure Google service tasks in parallel; coordinator integrates native lifecycle, persistence, pet behavior and credentials. Review and verify the integrated result before publication.

- [ ] Add failing compact-notepad journeys for real note persistence, draft preservation, reminders, Calendar status and separate compact settings.
- [ ] Implement new renderer components using existing notes/reminder APIs, with honest Google connection/sync status.
- [ ] Add failing OAuth/refresh/idempotent event-update tests, then implement pure Google Calendar client with PKCE loopback, narrow scopes and serialized network operations.
- [ ] Integrate encrypted native credential import, connection lifecycle and a persisted opt-in reminder outbox; retry errors and keep renderer secrets-free.
- [ ] Add failing random-paced movement/mandatory automatic joke tests; reduce fox size, remove manual joke option and route primary click to notepad.
- [ ] Build and run backend/desktop suites; obtain focused review, package only with frozen inputs, verify archive integrity, run packaged journeys and normal desktop preview.
- [ ] Complete concrete Google client setup/authorization where permitted. Clearly report any registration or consent still awaiting the user; do not claim a live connection from mocked tests.
- [ ] Publish verified source and verify hosted Windows CI.
