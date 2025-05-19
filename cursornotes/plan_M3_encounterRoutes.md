# Plan – M3: Encounter & Storyline Routes Extraction

### Context / Problem Statement
The monolithic `routes.js` still contains all encounter and storyline related endpoints. To align with the new domain-driven router architecture, they must be migrated into a dedicated `encounterRoutes.js` module without changing any public API paths or behaviour. This milestone covers the extraction, wiring, testing, and clean-up of those endpoints.

---

## Task Breakdown

### step-01: Inventory existing endpoints  **AUDITED**
*Completed on 2025-05-18. Endpoints catalogued below.*
- Goal: Enumerate every `/encounter`, `/storyline`, or related endpoint in `routes.js` and map their HTTP methods, middleware, and helper calls.
- Files: `server/routes.js` (read-only), `/cursornotes/plan_M3_encounterRoutes.md` (update endpoints catalogue)
- Acceptance tests: A bullet list of endpoints added under **Endpoints Catalogue** section in this plan.
- Est. time: < 1 h

### step-02: Scaffold `encounterRoutes.js`  **AUDITED**
*Stub router added and mounted at `/api/encounters` via src/routes/index.js. All endpoints return HTTP 501 plus health check.*
- Files: `src/routes/encounterRoutes.js` (created), `src/routes/index.js` (updated)
- Acceptance tests: To run via admin self-test once server restarts; stub returns 501.
- Est. time: < 1 h
- Actual time: 0.5 h

### step-03: Migrate read-only (GET) endpoints  **AUDITED**
- Goal: Move GET endpoints and their helper functions from `routes.js` into `encounterRoutes.js`, ensuring identical JSON output.
- Files: `src/routes/encounterRoutes.js`, `server/routes.js`, `src/helpers/encounter/*.js`
- Acceptance tests: Admin self-test block verifies all GET endpoints' response schemas are unchanged.
- Est. time: < 1 h
- Actual time: 0.75 h

### step-04: Migrate mutating (POST/PUT/DELETE) endpoints  **AUDITED**
*Completed on 2025-05-18. All POST endpoints implemented; stubs removed.*
- Goal: Move create/update/delete endpoints and any auth middleware into `encounterRoutes.js`.
- Files: `src/routes/encounterRoutes.js`
- Acceptance tests: Verified locally via Postman; admin self-test block to be added in step-06.
- Est. time: < 1 h
- Actual time: 0.9 h

### step-05: Wire new router & legacy alias  **AUDITED**
*Completed on 2025-05-18. Alias added in `server.js`.*
- Goal: Mount `encounterRoutes` in `server.js` at `/api/encounters`; keep legacy paths via alias middleware for backward compatibility.
- Files: `server.js`, `src/routes/encounterRoutes.js`
- Acceptance tests: Verified that `/encounters/create-blank-encounter` responds identically to `/api/encounters/create-blank-encounter`.
- Est. time: < 1 h
- Actual time: 0.3 h

### step-06: Integration & regression tests  **AUDITED**
*Completed on 2025-05-18. Encounter endpoints covered by admin self-test page block.*
- Goal: Add/extend admin self-test page blocks to cover all encounter endpoints.
- Files: `admin/selftest.html` (or appropriate view), `src/routes/encounterRoutes.js`, `selfTestRoutes.js`
- Acceptance tests: All new tests pass in browser; no console errors.
- Est. time: < 1 h
- Actual time: 1 h

### step-07: Clean up & documentation  **AUDITED**
*Completed on 2025-05-18. Legacy code removed from `routes.js`, API docs created, README updated.*
- Goal: Remove legacy encounter code from `routes.js`, update API docs, and add `/health/encounters` endpoint entry.
- Files: `server/routes.js`, `docs/API.md`, `README.md`
- Acceptance tests: `routes.js` no longer contains 'encounter' references; docs reflect new path.
- Est. time: < 1 h
- Actual time: 0.8 h

---

## Endpoints Catalogue
*Encounter-related endpoints inventoried from `routes.js`:*

1. **POST** `/create-blank-encounter`
2. **POST** `/update-encounter-field`
3. **POST** `/duplicateEncounter`
4. **GET** `/GetEncounterData/:id`
5. **POST** `/create-encounter-choice`
6. **POST** `/update-encounter-choice`
7. **POST** `/delete-encounter-choice`
8. **POST** `/set-receiving-encounter`
9. **GET** `/unlinked-encounters`
10. **GET** `/root-encounters`
11. **POST** `/delete-root-encounter`
12. **GET** `/encounter-display` *(SPA redirect)*
13. **GET** `/encounters2/:id` *(SPA route)*
14. **GET** `/game/:gameId/encounter/:id` *(SPA route)*

---

Status tags: **TODO**, **IN-PROGRESS**, **BLOCKED**, **DONE** 