### Plan: M4 - Extract Journal Endpoints into `src/routes/journalRoutesApi.js`

**Status:** **TODO**

**Context / Problem Statement:**
Legacy journal-related endpoints are currently defined in `server.js` or a similar old routing file (e.g., `journalRoutes.js` if it exists, or directly in `server.js`). These need to be migrated to a new modular router file `src/routes/journalRoutesApi.js` and exposed under the `/api/journal` path prefix. This aligns with the project goal of consolidating all API endpoints under `src/routes/` and the `/api/*` prefix.

**Task Breakdown:**

### step-01: Identify existing journal endpoints  **DONE**
- Goal: Locate all current journal-related routes, their handlers, and any specific middlewares they use. These are likely in `server.js` or a legacy `journalRoutes.js` (if it exists from previous phases or initial structure).
- Files: `server.js`, potentially `routes.js` or `src/routes/legacyRoutes.js` or `journalRoutes.js`.
- Acceptance tests: A list of all journal-related HTTP methods and paths is documented.
- Result: All journal routes found in `journalRoutes.js`. List of routes and their new proposed paths under `/api/journal/` documented in thought process.
  - Admin prompt management:
    - `GET /journal-prompts` -> `/api/journal/prompts`
    - `POST /journal-prompts` -> `/api/journal/prompts`
    - `PUT /journal-prompts/:id` -> `/api/journal/prompts/:id`
    - `DELETE /journal-prompts/:id` -> `/api/journal/prompts/:id`
    - `GET /journal-prompts/:id/stats` -> `/api/journal/prompts/:id/stats`
    - `POST /release-journal-prompt` -> `/api/journal/prompts/release`
    - `GET /journal-prompts/:id/recipients` -> `/api/journal/prompts/:id/recipients`
  - Student access & responses:
    - `GET /my-journal-prompts` -> `/api/journal/my-prompts`
    - `GET /journal-prompts/:id` (view prompt) -> `/api/journal/prompts/:id` (same as admin view, relies on internal logic for student access)
    - `POST /journal-prompts/:id/response` -> `/api/journal/prompts/:id/response`
    - `GET /journal-prompts/:id/my-response` -> `/api/journal/prompts/:id/my-response`
- Est. time: < 1 h

### step-02: Create `src/routes/journalRoutesApi.js`  **DONE**
- Goal: Set up the basic structure for the Express router in the new file, including necessary imports (Express, `dbPromise`, error handlers, etc.).
- Files: `src/routes/journalRoutesApi.js` (new)
- Acceptance tests: File is created with a basic Express router skeleton. Import paths are correct.
- Est. time: < 0.5 h

### step-03: Migrate journal GET endpoints  **DONE**
- Goal: Move the logic for handling GET requests (e.g., get all journals for a user, get a specific journal by ID) to the new router.
- Files: `src/routes/journalRoutesApi.js`, `server.js` (or old route file)
- Acceptance tests: GET endpoints are functional at `/api/journal/*` and return correct data. Old GET endpoints are removed.
- Est. time: < 1 h

### step-04: Migrate journal POST endpoints  **DONE**
- Goal: Move the logic for creating new journal entries to the new router.
- Files: `src/routes/journalRoutesApi.js`, `server.js` (or old route file)
- Acceptance tests: POST endpoint is functional at `/api/journal` and correctly creates entries. Old POST endpoint is removed.
- Est. time: < 1 h

### step-05: Migrate journal PUT/PATCH endpoints  **DONE**
- Goal: Move the logic for updating existing journal entries to the new router.
- Files: `src/routes/journalRoutesApi.js`, `server.js` (or old route file)
- Acceptance tests: PUT/PATCH endpoints are functional at `/api/journal/:id` and correctly update entries. Old PUT/PATCH endpoints are removed.
- Est. time: < 0.5 h (assuming simple updates)

### step-06: Migrate journal DELETE endpoints  **DONE**
- Goal: Move the logic for deleting journal entries to the new router.
- Files: `src/routes/journalRoutesApi.js`, `server.js` (or old route file)
- Acceptance tests: DELETE endpoint is functional at `/api/journal/:id` and correctly deletes entries. Old DELETE endpoint is removed.
- Est. time: < 0.5 h

### step-07: Mount the new router in `server.js`  **DONE**
- Goal: Integrate the new `journalRoutesApi.js` into the main application by mounting it at `/api/journal` and removing any old journal route setups from `server.js` or legacy files.
- Files: `server.js`, `src/routes/journalRoutesApi.js`, `routes.js`
- Acceptance tests: New router is correctly mounted. Application starts without errors. Old journal routes are no longer accessible at their previous paths. Call to `setupJournalRoutes(app)` and its import removed from `routes.js`.
- Est. time: < 0.5 h

### step-08: Update admin self-tests  **DONE**
- Goal: Add or update self-test blocks on the admin self-test page to cover all migrated `/api/journal/*` endpoints.
- Files: `src/routes/selfTestRoutesApi.js` (or wherever the admin self-test page handlers are), potentially a view file if HTML is generated server-side.
- Result: Added a new test suite "Journal API Routes (HTTP)" to `selfTestRoutes.js` covering CRUD for prompts and student interactions via the new `/api/journal/*` endpoints using `supertest`.
- Est. time: < 1 h

### step-09: Final Verification & Cleanup  **DONE**
- Goal: Perform a final round of testing for all journal endpoints. Ensure no old journal routes remain active or defined. Clean up any commented-out legacy code related to journal routes.
- Files: `server.js`, `src/routes/journalRoutesApi.js`, any legacy route files.
- Acceptance tests: All journal endpoints work as expected (verified by new self-tests). No dead code related to old journal routes. `git grep` for old journal route patterns yields no results in active code (old patterns now only in `journalRoutes.js` which is pending deletion in M7).
- Est. time: < 0.5 h

**M4 Overall Status: COMPLETED** 