# Plan: M3 - Extract Message Endpoints into `src/routes/messageRoutesApi.js`

**Milestone:** M3 - Extract **Message** endpoints into `src/routes/messageRoutesApi.js`
**Status:** **TODO**
**SOW Link:** `cursornotes/01_SOW.md`

## Context / Problem Statement
Currently, message-related endpoints are likely defined in `messageRoutes.js` and mounted directly in `server.js` or through the legacy `routes.js` system. This milestone aims to modernize this by migrating these endpoints to a new, dedicated router file `src/routes/messageRoutesApi.js` and ensuring they are served under the `/api` prefix, aligning with the project's goal of a unified API surface.

## Task Breakdown

### step-01: Analyze `messageRoutes.js` and existing mount points  **DONE**
- Goal: Fully understand the routes, handlers, and dependencies in the current `messageRoutes.js`. Identify how it's currently mounted in `server.js` or `routes.js`.
- Files:
    - `messageRoutes.js` (Read)
    - `server.js` (Read)
    - `routes.js` (Read, if it exists and is relevant)
- Acceptance tests:
    - List of all message routes and their current paths.
    - Confirmation of middleware used.
- Est. time: < 1 h

### step-02: Create `src/routes/messageRoutesApi.js` and migrate routes **DONE**
- Goal: Create the new router file and move all message-related route definitions and handlers from `messageRoutes.js` into it. Ensure all routes are designed to be mounted under `/api/messages` (or a similar appropriate path under `/api`).
- Files:
    - `src/routes/messageRoutesApi.js` (Create/Write)
    - `messageRoutes.js` (Read, to copy from)
- Acceptance tests:
    - `src/routes/messageRoutesApi.js` contains all logic previously in `messageRoutes.js`.
    - Routes in the new file are structured to work under an `/api` prefix.
    - Dependencies (like `dbPromise`, `authMiddleware`) are correctly imported/handled.
- Est. time: < 1.5 h

### step-03: Mount new `messageRoutesApi.js` in `server.js` **DONE**
- Goal: Update `server.js` to use the new `messageRoutesApi.js` router, mounting it at an appropriate path like `/api/messages`.
- Files:
    - `server.js` (Write)
    - `src/routes/index.js` (Write)
- Acceptance tests:
    - The new message router is correctly mounted in `server.js` under `/api` (via `src/routes/index.js`).
    - Server starts without errors.
- Est. time: < 0.5 h

### step-04: Deprecate/Remove old message route mounting and `messageRoutes.js` **DONE**
- Goal: Remove or comment out the old way message routes were mounted in `server.js` (or `routes.js`). Delete the old `messageRoutes.js` file.
- Files:
    - `server.js` (Write)
    - `routes.js` (Write, if applicable)
    - `messageRoutes.js` (Delete)
- Acceptance tests:
    - Old mounting points for message routes are removed.
    - `messageRoutes.js` is deleted.
    - Server starts and functions correctly with only the new routes.
- Est. time: < 0.5 h

### step-05: Update Admin Self-Tests for Message Endpoints **DONE**
- Goal: Ensure the admin self-test page is updated to reflect the new API paths for message endpoints. All tests for message functionality should pass.
- Files:
    - `src/routes/selfTestRoutesApi.js` or equivalent admin self-test file (Write) (`selfTestRoutes.js` updated)
- Acceptance tests:
    - Admin self-test page has updated URLs for message tests (New tests added for `/api/messages/*`).
    - All message-related self-tests pass.
- Est. time: < 0.5 h (Actual time was more due to adding new tests, ~1h)

### step-06: Final Verification and Cleanup **DONE**
- Goal: Perform a final check of all message endpoints, review code for any missed details, and ensure logging/error handling are consistent.
- Files:
    - `src/routes/messageRoutesApi.js` (Read)
    - `server.js` (Read)
    - `src/routes/index.js` (Read)
    - `selfTestRoutes.js` (Read)
- Acceptance tests:
    - All message endpoints function as expected through their new `/api/messages/*` paths (verified by new self-tests).
    - Code is clean and follows project conventions.
- Est. time: < 0.5 h 