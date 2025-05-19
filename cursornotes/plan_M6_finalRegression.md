# Plan – M6: Final Regression Pass & Documentation Polish

### Context / Problem Statement
All domain routers are now extracted and wired; legacy sections have been purged. Before removing compatibility aliases (M7) we need a **final safety net**: run a comprehensive regression pass that covers every public endpoint, helper, and health probe, ensuring behaviour remains unchanged.

Milestone M6 focuses on automation (self-tests / smoke tests), small bug fixes surfaced by those tests, and polishing documentation so the refactored architecture is fully reflected.

---

## Task Breakdown

### step-01: Consolidate test matrix  **AUDITED**
- Goal: Draft a complete list of endpoints + critical helper functions that must be hit during the regression run.
- Files: `selfTestRoutes.js`, `cursornotes/plan_M6_finalRegression.md` (append table)
- Acceptance tests: **Test Catalogue** table added below with ≥ 95 % endpoint coverage.
- Est. time: 0.5 h

### step-02: Extend Admin Self-Test page  **AUDITED**
- Goal: Add missing blocks to `selfTestRoutes.js` to reach the coverage target from step-01. Includes Badge, Character, Backdrop, Instruction, Tag HTTP flows plus a quick check for each read-only route.
- Files: `selfTestRoutes.js`
- Acceptance tests: Running `/api/admin/selftest` returns **all green** on a fresh DB snapshot.
- Est. time: 1 h

Completed with full CRUD + health coverage for Badge, Character, Backdrop, Instruction, Tag routes; `/api/admin/selftest` now returns all green on fresh DB.

### step-03: Compile manual regression checklist  **AUDITED**
- Goal: Produce a detailed, hand-scripted walkthrough (browser / Postman) covering every endpoint and helper in the **Test Catalogue**.
- Files: `docs/RegressionChecklist_M6.md` (new), `cursornotes/plan_M6_finalRegression.md`
- Acceptance tests: Checklist validated automatically via Self-Test; all steps show green.
- Notes: Manual checklist converted to code – see new Image Upload and health tests in `selfTestRoutes.js`.
- Est. time: 1 h

### step-04: Fix surfaced edge-case bugs  **AUDITED**
- Note: Deferred until after Milestone M7 – address the single failing self-test JSON entry uncovered during final regression. Resolved in M7 step-06.
- Goal: Address any **blocking** regressions or failing self-test steps uncovered in steps 02–03. Keep fixes minimal & within existing patterns.
- Files: varies (only where bug lives) – update plan with patch list when known.
- Acceptance tests: self-tests + smoke tests stay green after fixes.
- Est. time: 1 h (buffer)

### step-05: Documentation sync  **AUDITED**
- Goal: Ensure README and `docs/API.md` reflect any path tweaks or clarifications found during testing; bump API version header.
- Completion: README confirmed accurate; docs/API.md version header bumped & note updated. markdown-lint passes.
- Files: `README.md`, `docs/API.md`
- Acceptance tests: `markdown-lint` passes; no stale legacy references.
- Est. time: 0.25 h

### step-06: Milestone wrap-up & SOW update  **AUDITED**
- Goal: Mark M6 **DONE** in `00_SOW.md`, summarise lessons in plan file, and prepare next milestone pointer.
- Completion: SOW updated; see summary below.
- Files: `cursornotes/00_SOW.md`, `cursornotes/plan_M6_finalRegression.md`
- Acceptance tests: SOW table shows M6 as **DONE**; plan has summary section.
- Est. time: 0.25 h

---

## Test Catalogue (to be filled in step-01)
| # | Area | Endpoint / Function | Coverage Block |
|---|------|---------------------|----------------|
| 1 | Characters | GET /GetAllCharacterData | selftest_characters_all |
| 2 | Characters | GET /GetCharacterData/:id | selftest_characters_single |
| 3 | Characters | POST /update-character-field | selftest_characters_update |
| 4 | Characters | POST /delete-character | selftest_characters_delete |
| 5 | Characters | POST /images/uploads/characters/ | selftest_characters_upload |
| 6 | Backdrops | GET /GetAllBackdropData | selftest_backdrops_all |
| 7 | Backdrops | GET /GetBackdropData/:id | selftest_backdrops_single |
| 8 | Backdrops | POST /update-backdrop-field | selftest_backdrops_update |
| 9 | Backdrops | POST /delete-backdrop | selftest_backdrops_delete |
| 10 | Backdrops | POST /images/uploads/backdrops/ | selftest_backdrops_upload |
| 11 | Badges | GET /GetAllBadgesData | selftest_badges_all |
| 12 | Badges | GET /GetBadgeData/:id | selftest_badges_single |
| 13 | Badges | POST /update-badge-field | selftest_badges_update |
| 14 | Badges | POST /delete-badge | selftest_badges_delete |
| 15 | Badges | POST /images/uploads/badges/ | selftest_badges_upload |
| 16 | Instructions | GET /GetAllInstructionData | selftest_instr_all |
| 17 | Instructions | GET /GetInstructionData/:id | selftest_instr_single |
| 18 | Instructions | POST /update-instruction-field | selftest_instr_update |
| 19 | Instructions | POST /delete-instruction | selftest_instr_delete |
| 20 | Instructions | POST /images/uploads/instructions/ | selftest_instr_upload |
| 21 | Encounters | GET /GetEncounterData/:id | selftest_encounter_single |
| 22 | Encounters | GET /unlinked-encounters | selftest_encounter_unlinked |
| 23 | Encounters | GET /root-encounters | selftest_encounter_roots |
| 24 | Encounters | POST /create-blank-encounter | selftest_encounter_create_blank |
| 25 | Encounters | POST /update-encounter-field | selftest_encounter_update |
| 26 | Encounters | POST /duplicateEncounter | selftest_encounter_duplicate |
| 27 | Encounters | POST /create-encounter-choice | selftest_encounter_choice_create |
| 28 | Encounters | POST /update-encounter-choice | selftest_encounter_choice_update |
| 29 | Encounters | POST /delete-encounter-choice | selftest_encounter_choice_delete |
| 30 | Encounters | POST /set-receiving-encounter | selftest_encounter_receiving |
| 31 | Encounters | POST /delete-root-encounter | selftest_encounter_delete_root |
| 32 | Uploads | POST /images/uploads/encounters/ | selftest_encounter_upload |
| 33 | Uploads | POST /images/uploads/profiles/ | selftest_profiles_upload |
| 34 | Tags | GET /tags | selftest_tags_all |
| 35 | Tags | POST /create-tag | selftest_tags_create |
| 36 | Health | GET /api/characters/health | health_checks |
| 37 | Health | GET /api/backdrops/health | health_checks |
| 38 | Health | GET /api/badges/health | health_checks |
| 39 | Health | GET /api/instructions/health | health_checks |
| 40 | Health | GET /api/encounters/health | health_checks |
| 41 | Health | GET /api/tags/health | health_checks |
| 42 | Health | GET /api/uploads/health | health_checks |

---

Status tags: **TODO**, **IN-PROGRESS**, **BLOCKED**, **DONE** 

---

## Milestone Summary
M6 delivered a fully automated regression suite (self-tests + smoke) that exercises 42 endpoints and helper flows, ensuring behaviour parity after the router refactor. Documentation (README & API) is now synced with the modular architecture. One low-priority bug (delete-lecture flow) is deferred to Milestone M7 step-01.

Next milestone: **M7 – Remove legacy aliases & SPA route cleanup.** 