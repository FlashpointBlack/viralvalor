# Statement of Work (SOW)

## Goal
Replace the monolithic `routes.js` file with a clean, domain-driven router architecture **without changing the existing public API or URLs**.

## Deliverables
- [x] Domain-specific Express routers (`lectureRoutes`, `encounterRoutes`, `questionRoutes`, etc.)
- [x] Unit & integration tests ensuring unchanged behaviour
- [x] Health-check endpoints for every service **(added)**
- [x] Documentation update (README & API docs)
- [x] Removal of deprecated mega-route code (completed via TD1)

## Out-of-scope
- Front-end React SPA rewrites
- DB schema changes unrelated to routing
- Performance tuning / refactors beyond routing extraction

## Dependencies
- Auth0 authentication middleware
- MySQL connectivity via `dbPromise`

## Milestones

| # | Title | Est. Time | Status |
|---|-------|-----------|--------|
| M1 | Scaffold modular router structure & add health endpoints | 4 h | **DONE** |
| M2 | [Extract lecture endpoints](plan_M2_lectureRoutes.md) into `lectureRoutes.js` | 6 h | **DONE (AUDITED)** |
| M3 | [Extract encounter/**storyline** endpoints](plan_M3_encounterRoutes.md) into `encounterRoutes.js` | 6 h | **DONE (AUDITED)** |
| M4 | Extract question-bank endpoints into `questionRoutes.js` | 6 h | **DONE (AUDITED)** |
| M5 | Delete legacy sections from `routes.js`, wire `server.js` to new routers | 4 h | **DONE (via TD1)** |
| M6 | Final regression test pass & documentation update | 4 h | **DONE (AUDITED)** |
| M7 | Update SPA to use `/api` endpoints and remove legacy route aliases | 4 h | **DONE (AUDITED)** |
| TD1 | [Final `routes.js` Cleanup (from M5)](plan_TD1_routesCleanup.md) | 4h | **DONE (AUDITED)** |

*Each milestone is ≤ 8 work-hours as required.*

## Timeline (draft)
- M1 – completed 2025-05-17
- M2 – completed 2025-05-18 (Audited)
- M3 – completed 2025-05-18 (Audited)
- M4 – completed 2025-05-18 (Audited)
- M5 – completed 2025-05-21 (via TD1)
- M6 – completed 2025-05-19 (Audited)
- M7 – completed 2025-05-20 (Audited)
- TD1 – completed 2025-05-21 (Audited)

## Progress Update – 2025-05-20
- Milestones **M1 – M4, M6, M7** are fully complete and audited. React SPA consumes `/api/*` namespace; compatibility aliases removed.
- Milestones **M5** and **TD1** are now fully complete; all router extraction work is done. No further optimisations pending under current scope.
- All documentation has been updated for completed work. Self-tests are green for audited milestones.
- Next step: Complete TD1 or plan subsequent optimisation backlog.

## Progress Update – 2025-05-21
- Milestones **M1 – M4, M6, M7** are fully complete and audited. React SPA consumes `/api/*` namespace; compatibility aliases removed.
- Milestones **M5** and **TD1** are now fully complete; all router extraction work is done. No further optimisations pending under current scope.
- All documentation has been updated for completed work. Self-tests are green for audited milestones.
- Next step: Complete TD1 or plan subsequent optimisation backlog.

_Last updated: 2025-05-21 (TD1 complete)_

## Progress Update – 2025-05-22
- Audit of Milestone **TD1** (Final `routes.js` Cleanup) completed. All planned route extractions from `routes.js` are verified.

## Technical Summary: M5 & TD1 Route Cleanup (Audited)

Milestones M5 and TD1 focused on the refactoring of the legacy `routes.js` file to finalize the transition to a modular, domain-driven routing architecture. The audit completed on 2025-05-22 confirms these changes.

**Initial Problem:**
The `routes.js` file historically contained a large number of route handlers for various application domains. This monolithic structure made maintenance and development cumbersome. While earlier milestones (M2-M4) extracted major domains like Lectures, Encounters, and Questions, several other domains remained intermingled within `routes.js`.

**Work Performed (M5 & TD1):**
The primary activities during these milestones, and verified by the audit, included:
1.  **Inventory of Remaining Routes:** A systematic identification of all route definitions in `routes.js` that belonged to domains intended for modularization. These included:
    *   Badges
    *   Characters
    *   Backdrops
    *   Student Instructions
    *   Tags
2.  **Route Extraction and Verification:**
    *   Ensured that dedicated route modules (e.g., `src/routes/badgeRoutes.js`, `src/routes/characterRoutes.js`, etc.) were in place and correctly handling their respective API endpoints (typically under an `/api/[domain]/` path).
    *   Systematically removed the identified duplicated route handlers from `routes.js`. Grep searches and manual code inspection during the audit confirmed their absence.
3.  **Orphaned Code Purge:**
    *   A final pass was made on `routes.js` to remove helper functions or `require` statements that became unused after the route migrations. The audit confirmed that no obvious orphaned code related to the migrated domains remains *within `routes.js`*. Comments within `routes.js` also corroborate these removals.

**Outcome:**
- `routes.js` has been significantly streamlined. It no longer contains the route handlers for Badges, Characters, Backdrops, Student Instructions, or Tags.
- These domains are now exclusively managed by their dedicated router files located in the `src/routes/` directory.
- The application's public API and URLs for these domains remain unchanged, ensuring backward compatibility, as requests are correctly routed to the new modular handlers.
- All self-tests related to these domains were reported as passing post-migration, indicating functional correctness.

This completes the planned cleanup of `routes.js` as per the original SOW, with the system now relying on a more maintainable and organized routing structure.