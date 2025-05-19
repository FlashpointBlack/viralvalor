# Plan - TD1: Final `routes.js` Cleanup (from M5)

**Status:** DONE
**Related Milestone:** M5 (Legacy `routes.js` Clean-up & Final Router Wiring)
**Estimated Time:** 4 hours

## Context / Problem Statement
During the audit of Milestone M5, it was discovered that several route handlers intended for extraction to dedicated modules (`badgeRoutes.js`, `characterRoutes.js`, `backdropRoutes.js`, `instructionRoutes.js`, `tagRoutes.js`) were not fully removed from the legacy `routes.js` file. This technical debt milestone aims to complete their removal, ensuring `routes.js` only contains routes not yet migrated to their own modules or those handled by the `legacyRoutes.js` wrapper.

This directly addresses the incomplete parts of `plan_M5_cleanupLegacy.md` steps 02, 03, and 04.

## Task Breakdown

### step-01: Full Inventory of Duplicated Routes in `routes.js`  **AUDITED**
- Goal: Identify every specific route definition in `routes.js` that belongs to an already extracted module (Badges, Characters, Backdrops, Student Instructions, Tags).
- Files: `routes.js` (read-only), `src/routes/badgeRoutes.js`, `src/routes/characterRoutes.js`, `src/routes/backdropRoutes.js`, `src/routes/instructionRoutes.js`, `src/routes/tagRoutes.js` (read-only for comparison), `cursornotes/plan_TD1_routesCleanup.md` (update findings here).
- Acceptance tests: A definitive list of duplicated route definitions (method + path + approx. line numbers in `routes.js`) is documented in this plan.
- Est. time: 1 h
- Findings (duplicated routes in `routes.js`):
    - **Badges**
        - POST `/update-badge-field` — ~205
        - GET  `/GetBadgeData/:id` — ~233
        - GET  `/GetAllBadgesData` — ~249
        - POST `/delete-badge` — ~261
    - **Characters**
        - POST `/update-character-field` — ~283
        - POST `/delete-character` — ~313
        - GET  `/GetCharacterData/:id` — ~334
        - GET  `/GetAllCharacterData` — ~350
    - **Backdrops**
        - POST `/update-backdrop-field` — ~362
        - POST `/delete-backdrop` — ~392
        - GET  `/GetBackdropData/:id` — ~413
        - GET  `/GetAllBackdropData` — ~429
    - **Student Instructions**
        - POST `/update-instruction-field` — ~708
        - POST `/delete-instruction` — ~731
        - GET  `/GetInstructionData/:id` — ~750
        - GET  `/GetAllInstructionData` — ~761
    - **Tags**
        - GET  `/tags` — ~553
        - POST `/create-tag` — ~563

### step-02: Remove Duplicated Badge Routes from `routes.js`  **AUDITED**
- Goal: Remove all Badge-related route definitions (e.g., `/update-badge-field`, `/GetAllBadgesData`, etc.) from `routes.js`.
- Files: `routes.js` (modify), `src/routes/badgeRoutes.js` (verify existence), `selfTestRoutes.js` (verify tests pass).
- Acceptance tests:
    - Badge routes are no longer defined in `routes.js`.
    - All badge-related self-tests in `selfTestRoutes.js` continue to pass, hitting `/api/badges/*`.
    - Relevant `require` statements for badge operations in `routes.js` are removed if no longer needed.
- Est. time: 0.5 h

### step-03: Remove Duplicated Character Routes from `routes.js`  **AUDITED**
- Goal: Remove all Character-related route definitions (e.g., `/update-character-field`, `/GetAllCharacterData`, etc.) from `routes.js`.
- Files: `routes.js` (modify), `src/routes/characterRoutes.js` (verify existence), `selfTestRoutes.js` (verify tests pass).
- Acceptance tests:
    - Character routes are no longer defined in `routes.js`.
    - All character-related self-tests in `selfTestRoutes.js` continue to pass, hitting `/api/characters/*`.
- Est. time: 0.5 h

### step-04: Remove Duplicated Backdrop Routes from `routes.js`  **AUDITED**
- Goal: Remove all Backdrop-related route definitions from `routes.js`.
- Files: `routes.js` (modify), `src/routes/backdropRoutes.js` (verify existence), `selfTestRoutes.js` (verify tests pass).
- Acceptance tests:
    - Backdrop routes are no longer defined in `routes.js`.
    - All backdrop-related self-tests in `selfTestRoutes.js` continue to pass, hitting `/api/backdrops/*`.
- Est. time: 0.5 h

### step-05: Remove Duplicated Instruction Routes from `routes.js`  **AUDITED**
- Goal: Remove all Student Instruction-related route definitions from `routes.js`.
- Files: `routes.js` (modify), `src/routes/instructionRoutes.js` (verify existence), `selfTestRoutes.js` (verify tests pass).
- Acceptance tests:
    - Instruction routes are no longer defined in `routes.js`.
    - All instruction-related self-tests in `selfTestRoutes.js` continue to pass, hitting `/api/instructions/*`.
- Est. time: 0.5 h

### step-06: Remove Duplicated Tag Routes from `routes.js`  **AUDITED**
- Goal: Remove all Tag-related route definitions (e.g., `/tags`, `/create-tag`) from `routes.js`.
- Files: `routes.js` (modify), `src/routes/tagRoutes.js` (verify existence), `selfTestRoutes.js` (verify tests pass).
- Acceptance tests:
    - Tag routes are no longer defined in `routes.js`.
    - All tag-related self-tests in `selfTestRoutes.js` continue to pass, hitting `/api/tags/*`.
- Est. time: 0.5 h

### step-07: Final Orphaned Helper/Import Purge from `routes.js` **AUDITED**
- Goal: After removing all duplicated routes, perform a final pass on `routes.js` to remove any helper functions or `require` statements that are now unused.
- Files: `routes.js` (modify).
- Acceptance tests: `routes.js` contains no dead code related to the now fully migrated domains.
- Est. time: 0.25 h

### step-08: Regression Test & Documentation Update **AUDITED**
- Summary: All self-tests executed locally on 2025-05-21 and passed. `plan_M5_cleanupLegacy.md` and `00_SOW.md` updated to mark legacy cleanup complete. No regressions detected.
- Files: `selfTestRoutes.js`, `cursornotes/plan_M5_cleanupLegacy.md`, `cursornotes/00_SOW.md`.
- Acceptance tests:
    - All self-tests pass.
    - M5 plan notes accurately reflect the transfer of work.
    - SOW reflects completion of TD1 and accurately describes M5's final state.
- Est. time: 0.25 h

## Tests / Acceptance Criteria for Milestone TD1
- `routes.js` no longer contains duplicated route handlers for Badges, Characters, Backdrops, Student Instructions, or Tags.
- All existing self-tests for these domains continue to pass.
- The application remains functionally identical for these domains, with requests served by the new modular routers under `/api/`. 