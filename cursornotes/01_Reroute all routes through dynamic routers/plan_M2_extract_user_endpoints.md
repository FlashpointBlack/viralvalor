# Plan: M2 - Extract User Endpoints into `src/routes/userRoutesApi.js`

## Context / Problem Statement
This milestone focuses on migrating all user-related API endpoints from the legacy `userRoutes.js` file (and any inline definitions in `routes.js`) into a new, dedicated router module at `src/routes/userRoutesApi.js`. These routes must then be exposed exclusively under the `/api/users/*` path prefix. This involves modifying `server.js` to remove the old root-level mount and updating `src/routes/index.js` to correctly mount the new user API router.

## Task Breakdown

### step-01: Create `src/routes/userRoutesApi.js` and Scaffold **DONE**
- Goal: Create the new file and set up the basic Express router structure.
- Files: `src/routes/userRoutesApi.js` (create)
- Acceptance tests:
    - File `src/routes/userRoutesApi.js` exists.
    - It exports an Express router instance.
    - It includes a basic health check endpoint (e.g., `/api/users/health`) for initial testing.
- Est. time: < 1 h

### step-02: Migrate Endpoints from `userRoutes.js` to `userRoutesApi.js` **DONE**
- Goal: Transfer all route definitions from the old `userRoutes.js` into the new `userRoutesApi.js`, adapting them to the new router structure.
- Files: `userRoutes.js` (read), `src/routes/userRoutesApi.js` (modify)
- Acceptance tests:
    - All logical routes from `userRoutes.js` are present in `userRoutesApi.js`.
    - Paths are relative to the router's mount point (e.g., `/` for `/api/users/`, `/:userId` for `/api/users/:userId`).
- Est. time: 1.5 h

### step-03: Migrate Inline User Routes from `routes.js` **DONE**
- Goal: Identify and move user-specific inline routes from `routes.js` (e.g., `/submit-profile`, `/profile`) into `src/routes/userRoutesApi.js`.
- Files: `routes.js` (read), `src/routes/userRoutesApi.js` (modify)
- Acceptance tests:
    - Routes like `/submit-profile` and `/profile` are implemented in `userRoutesApi.js` (e.g., as `/profile`, `/submit-profile` which will become `/api/users/profile`, `/api/users/submit-profile`).
- Est. time: 0.5 h

### step-04: Mount `userRoutesApi.js` in `src/routes/index.js` **DONE**
- Goal: Import the new `userRoutesApi.js` router in `src/routes/index.js` and mount it at the `/users` path.
- Files: `src/routes/index.js` (modify), `src/routes/userRoutesApi.js` (read)
- Acceptance tests:
    - `src/routes/index.js` correctly imports and uses the `userRoutesApi.js` router under the `/users` path.
    - The `/api/users/health` endpoint (if implemented) is accessible.
- Est. time: < 0.5 h

### step-05: Remove Old User Route Mounts and Definitions **DONE**
- Goal: Eliminate the legacy mounting points for user routes to ensure they are only served via `/api/users`.
- Files: `server.js` (modify), `routes.js` (modify)
- Acceptance tests:
    - The `userRouter` setup and `app.use('/', userRouter)` related to `userRoutes.js` are removed from `server.js`.
    - The `setupUserRoutes(app)` call is removed or commented out from `routes.js`.
    - Old user endpoints (e.g., `/profile` at root) are no longer accessible or return 404 (or redirect, if planned later for M6).
    - New endpoints (e.g., `/api/users/profile`) function correctly.
- Est. time: 1 h

### step-06: Testing and Verification **DONE**
- Goal: Thoroughly test all migrated user endpoints, including those from `userRoutes.js` and the inline ones from `routes.js`. Update admin self-tests.
- Files: (Test client/Postman), `src/routes/selfTestRoutesApi.js` (potentially modify or add tests)
- Acceptance tests:
    - All original user functionalities are working correctly via the new `/api/users/*` paths.
    - Admin self-test page includes tests for critical user endpoints, and they pass.
- Est. time: 0.5 h

---
*Progress will be updated here by marking steps as IN-PROGRESS or DONE.* 