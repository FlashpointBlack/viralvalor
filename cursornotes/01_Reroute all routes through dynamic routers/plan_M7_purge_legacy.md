# Plan: M7 - Purge Legacy Files & Mounts, Update Docs, Run Full Regression

- Goal: To remove all legacy routing code, update documentation to reflect the new API structure, and perform a full regression test to ensure system stability.
- Est. Time: 3 hours
- Related SOW Milestone: M7

---

### step-00: Purge Legacy Route Files and Server Mounts  **DONE**
- Goal: Remove `routes.js`, `src/routes/legacyRoutes.js`, and their corresponding mounts in `server.js`. Also remove any other ad-hoc legacy route handlers from `server.js`.
- Files:
    - `server.js` (modify)
    - `routes.js` (delete)
    - `src/routes/legacyRoutes.js` (delete)
- Acceptance tests:
    - `routes.js` and `src/routes/legacyRoutes.js` are deleted.
    - `server.js` no longer contains `require` statements or `app.use()` calls for these deleted files.
    - `server.js` no longer contains ad-hoc route definitions for `/am-admin`, `/am-educator`, etc., as these are now served via `/api/` routes.
    - `git grep "setupRoutes("` returns no matches (as per SOW acceptance criteria).
    - The `redirectShim` middleware should remain in place for this release cycle.
- Est. time: < 1 h

### step-01: Verify Server Startup and Basic Functionality  **DONE**
- Goal: Ensure the server operates correctly after legacy code removal.
- Files: N/A (testing procedure)
- Acceptance tests:
    - Server starts without errors.
    - `/api/*` routes function as expected.
    - Non-API routes (SPA fallback, static assets like `/images/*`) are still served correctly.
    - Attempting to access old root-level URLs (e.g., `/users`, `/messages`) should be handled by the `redirectShim`.
- Est. time: < 0.5 h

### step-02: Update API Documentation & README  **DONE**
- Goal: Ensure all project documentation reflects the current API structure.
- Files:
    - `README.md` (modify)
    - `docs/API.md` (modify)
- Acceptance tests:
    - `README.md` accurately describes the `/api/*` endpoint structure and removal of legacy routes.
    - All API documentation is updated to reference only `/api/*` paths.
    - References to `routes.js` or `legacyRoutes.js` are removed from documentation.
- Est. time: < 1 h

### step-03: Verify/Update Admin Self-Test Page  **SKIPPED**
- Goal: Confirm the admin self-test page is up-to-date and all tests pass. (Skipped as per user request - page to be removed later)
- Files:
    - `client/src/components/DebugPanel.js` (verify, potentially modify)
- Acceptance tests:
    - Admin self-test page exclusively uses `/api/*` endpoints.
    - All tests on the admin self-test page pass, covering Users, Messages, Journal, and core Self-Test functionalities.
    - Admin self-test page shows **green** across *User*, *Message*, *Journal*, and *Self-Test* sections (as per SOW acceptance criteria).
- Est. time: < 0.5 h

### step-04: Perform Full End-to-End Regression & Log Results  **DONE**
- Goal: Conduct a comprehensive regression test and document the results.
- Files:
    - `/cursornotes/testing/phase2_final_checks.md` (create/update)
- Acceptance tests:
    - A checklist of key user flows and API interactions is defined for regression testing.
    - All tests in the checklist are executed.
    - Results (pass/fail, observations) are logged in `/cursornotes/testing/phase2_final_checks.md`.
    - Any new issues found are documented for subsequent fixing.
- Est. time: < 1 h

### step-05: Update SOW and Plan (M7)  **DONE**
- Goal: Mark M7 as **DONE** in `01_SOW.md` and this plan.
- Files: `cursornotes/01_SOW.md`, `cursornotes/plan_M7_purge_legacy.md`
- Acceptance tests:
    - Files are updated and committed.
- Est. time: < 1 h

---
*This plan outlines the steps to finalize the removal of legacy routing and ensure system integrity.* 