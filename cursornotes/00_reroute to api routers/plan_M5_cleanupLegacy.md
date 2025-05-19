# Plan – M5: Legacy `routes.js` Clean-up & Final Router Wiring

### Context / Problem Statement
After migrating lectures (M2), encounters (M3) and the question bank (M4) into dedicated modules, `routes.js` still contains **miscellaneous** domain logic (badges, characters, backdrops, student instructions, tags) plus numerous utility helpers that duplicate code elsewhere.  To finish the routing extraction effort we must

1. Remove every section that has already been migrated, leaving **no dead code** inside `routes.js`.
2. Ensure `server.js` mounts *only* the new modular routers (and optional compatibility aliases).
3. Add a tiny compatibility catch-all (`/api/legacy-health`) so uptime tools can detect accidental regressions.

No public URLs may change during this milestone – only the *internal* file organisation.

---

## Task Breakdown

### step-01: Inventory remaining legacy blocks  **AUDITED**
- Goal: List every _non-migrated_ endpoint group still present in `routes.js` and decide whether it merits a new router or stays.
- Files: `routes.js` (read-only), `cursornotes/plan_M5_cleanupLegacy.md` (update list)
- Acceptance tests: A **Remaining Blocks** table is appended below.
- Est. time: < 1 h

### Status
**DONE – 2025-05-18**  _Inventory completed and table populated._

### step-02: Extract small, stable domains  **DONE – Completed via TD1**
- Goal: Move Badge, Character, Backdrop & Student-Instruction endpoints into individual routers under `src/routes/` **without altering paths**.
- Files: `src/routes/badgeRoutes.js` (new), `src/routes/characterRoutes.js`, `src/routes/backdropRoutes.js`, `src/routes/instructionRoutes.js`, `src/routes/index.js`, `server.js`
- Acceptance tests: Admin self-test page is extended to hit one happy-path endpoint from each new router and returns 200.
- Note: Audit found that routes for Badges and Characters (and potentially others) were not fully removed from `routes.js`. This remaining cleanup is now part of `plan_TD1_routesCleanup.md`.
- Est. time: 3 h

### step-03: Optional – Tag endpoints decision  **DONE – Completed via TD1**
- Goal: Decide whether simple `/tags` & `/create-tag` endpoints remain in monolith or warrant `tagRoutes.js`.  Implement decision and document rationale.
- Files: `routes.js` OR `src/routes/tagRoutes.js`, `cursornotes/plan_M5_cleanupLegacy.md`
- Acceptance tests: Existing tag API calls succeed in the browser; no duplicate code left.
- Note: Audit found that Tag routes were not fully removed from `routes.js`. This remaining cleanup is now part of `plan_TD1_routesCleanup.md`.
- Est. time: < 0.5 h

### step-04: Purge dead helpers & duplicate imports  **DONE – Completed via TD1**
- Goal: Delete unused helper functions (`_deprecated_*`) and any now-orphaned `require` lines from `routes.js`.
- Files: `routes.js`
- Acceptance tests: `npm run dev` starts with **no** linter or run-time warnings about undefined functions.
- Note: Full completion of this step is dependent on the route removals in `plan_TD1_routesCleanup.md`.
- Est. time: 0.5 h

### step-05: Legacy health probe & alias audit  **AUDITED**
- Goal: Add `/api/legacy-health` endpoint via fallback router and validate aliases.
- Outcome: `/api/legacy-health` implemented in `legacyRoutes.js`; verified via new self-test block.

### step-06: Integration & regression tests  **AUDITED**
- Goal: Extend `selfTestRoutes.js` with tests for every new router and legacy probe.
- Outcome: Self-test now covers badge, character, backdrop, instruction, tag and legacy health routes, all passing in local run.

### step-07: Documentation & SOW update  **AUDITED**
- Goal: Mark M5 **DONE** in SOW, update README & API docs for new health paths, summarise changes.
- Outcome: SOW, README.md and docs/API.md updated; Router Status table now includes badges, characters, backdrops, instructions, tags and legacy health probe.
- Est. time: 0.25 h

---

## Remaining Blocks (discovered in step-01)
_To be filled during step-01._

| # | Domain | Example Path | Keep / Extract? |
|---|--------|--------------|-----------------|
| 1 | Badges | POST `/update-badge-field` | Extract |
| 2 | Character Models | POST `/update-character-field` | Extract |
| 3 | Backdrops | POST `/update-backdrop-field` | Extract |
| 4 | Student Instructions | POST `/update-instruction-field` | Extract |
| 5 | Tags | GET `/tags` | Extract (tagRoutes.js created) |
| 6 | System Messaging | POST `/send-system-message` | Keep (monolith for now) |
| 7 | Lecture (duplicates) | POST `/submit-lecture-for-approval` | Remove (already in `lectureRoutes.js`) |
| 8 | Legacy HTML Redirects | GET `/encounter` (→ SPA) | Keep |

---

Status tags: **TODO**, **IN-PROGRESS**, **BLOCKED**, **DONE** 