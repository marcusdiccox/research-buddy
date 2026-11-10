# Animals and automatic updates implementation plan

Goal: ship red panda/otter choices, transitions and swimming plus a usable GitHub release updater.

Spec: ../specs/2026-11-10-animals-updates-design.md

- [x] Publish the prior backup release 0.8.1 after fixing the asynchronous checkbox test and passing Windows CI.
- [x] Generate base, transition and swimming atlases with the built-in image tool; run a cleanup edit pass; preserve project copies and prompt provenance.
- [x] Add failing tests for species persistence/default/validation and otter-specific movement, hover, bounds and motion preference; implement preference and behavior.
- [x] Wire species atlases into the common renderer, palette and baseline pipeline; add separate Animal/Appearance choices per user follow-up and a species-specific play action.
- [x] Add failing controller tests for update eligibility, state, duplicate checks, offline failure, ready preservation and shutdown deferral. Implement fixed-release-feed integration with test isolation and compact status control.
- [x] Build metadata, installer naming and CI artifact coverage. Version 0.9.0. No token is embedded.
- [x] Run backend, build, packaged desktop/sprite checks and independent review. Exercise the real release feed/download using an isolated probe.
- [x] Commit/push, await Windows checks, publish installer/latest.yml/blockmap together and verify remote hashes. Explain the one-time manual upgrade.

Final evidence is recorded in ../../animals-updates-verification.md. The user's previously closed installation was upgraded and launched after a fresh notebook backup; live update checking and preserved notebook content were verified.
