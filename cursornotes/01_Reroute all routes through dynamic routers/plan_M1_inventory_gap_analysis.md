# Plan: M1 - Inventory & Gap Analysis of Remaining Non-Modular Endpoints

## Context / Problem Statement
The goal of this milestone is to identify all HTTP endpoints not currently managed within the `src/routes/` directory and exposed via the single `/api/*` path prefix, as per the SOW for Phase II. This involves analyzing `server.js`, the legacy `routes.js` file, and any files they reference for route definitions.

## Task Breakdown & Findings

### step-01: Initial File Review & `server.js` Analysis **DONE**
- **Goal:** Identify primary route setup locations and legacy files.
- **Files Reviewed:** `server.js`, root directory listing, `src/` directory listing.
- **Findings in `server.js`:**
    - Mounts `src/routes` at `/api` (target pattern).
    - Legacy `userRoutes.js` mounted at `/` via `app.use('/', userRouter);` after `setupUserRoutes(userRouter)`.
    - Legacy `messageRoutes.js` mounted directly on `app` (root path) via `setupMessageRoutes(app)`.
    - Static file serving for `/images`.
    - Ad-hoc root endpoints: `/am-admin` and `/am-educator`. (Note: `/api/am-admin` and `/api/am-educator` also exist in `server.js`).

### step-02: `routes.js` and `src/routes/legacyRoutes.js` Analysis **DONE**
- **Goal:** Understand how `routes.js` (via `setupRoutes`) and `src/routes/legacyRoutes.js` contribute to routing.
- **Files Reviewed:** `routes.js`, `src/routes/legacyRoutes.js`, `src/routes/index.js`.
- **Findings:**
    - `src/routes/legacyRoutes.js` imports `setupRoutes` from `../../routes.js` and applies it to its own router.
    - `src/routes/index.js` mounts this `legacyRoutes` router at its root (`/`). Since `src/routes/index.js` is mounted at `/api` in `server.js`, all routes from `routes.js` are effectively also available under `/api/`.
    - `routes.js` (`setupRoutes`) calls:
        - `setupUserRoutes(app);` (Redundant with `server.js` call, but on `app` instance from `legacyRoutes` router).
        - `setupMessageRoutes(app);` (Redundant with `server.js` call, and `src/routes/index.js` has its own more direct `setupMessageRoutes(router)` call).
        - `setupJournalRoutes(app);` (Mounts `journalRoutes.js` likely at root of the `legacyRoutes` router, so `/api/journal/...`).
        - `setupSelfTestRoutes(app);` (Mounts `selfTestRoutes.js` likely at root of the `legacyRoutes` router, so `/api/selftest/...`).
        - `setupArticleRoutes(app);`
        - `setupLectureRoutes(app);`
        - `setupImageRoutes(app);`
    - `routes.js` also contains numerous inline route definitions (e.g., `/admin`, `/submit-profile`, `/profile`, SPA page serving GETs, lecture management, system messages).

## Summary of Endpoints/Files Requiring Migration (Gap Analysis):

1.  **`userRoutes.js`** (root file)
    *   **Currently:** Mounted at `/` (by `server.js`) and also effectively at `/api/` (via `legacyRoutes.js` -> `routes.js`).
    *   **Target:** Move to `src/routes/userRoutesApi.js`, mounted *only* at `/api/users` (or similar). Root mount and legacy API mount to be removed.

2.  **`messageRoutes.js`** (root file)
    *   **Currently:** Mounted at `/` (by `server.js`), also at `/api/` (via `legacyRoutes.js`), and also correctly at `/api/` by `src/routes/index.js` calling `setupMessageRoutes(router)`.
    *   **Target:** File to become `src/routes/messageRoutesApi.js`. The root mount in `server.js` and the mount via `legacyRoutes.js` must be removed. The existing setup in `src/routes/index.js` using `setupMessageRoutes` (from the new file location) will be the sole mechanism.

3.  **`journalRoutes.js`** (root file)
    *   **Currently:** Mounted via `routes.js` -> `legacyRoutes.js`, effectively at `/api/journal/...`.
    *   **Target:** Move to `src/routes/journalRoutesApi.js`, mounted *only* at `/api/journal` (or similar) via `src/routes/index.js`.

4.  **`selfTestRoutes.js`** (root file)
    *   **Currently:** Mounted via `routes.js` -> `legacyRoutes.js`, effectively at `/api/selftest/...`.
    *   **Target:** Move to `src/routes/selfTestRoutesApi.js`, mounted *only* at `/api/selftest` via `src/routes/index.js`.

5.  **Inline routes in `routes.js`**:
    *   **`/admin` (GET):** Serves SPA page. To be removed; rely on `server.js` SPA fallback.
    *   **`/submit-profile` (POST):** API. To be moved to `userRoutesApi.js` as `/api/users/profile` or `/api/users/submit-profile`.
    *   **`/profile` (GET):** API. To be moved to `userRoutesApi.js` as `/api/users/profile`.
    *   **`/complete-profile` (GET):** Redirect. To be 301 redirected to an SPA route or `/api/users/profile` if it implies an action.
    *   **SPA Page GETs (`/chat`, `/multiplayer`, `/educator-panel`, etc.):** To be removed; rely on `server.js` SPA fallback.
    *   **`/my-released-lectures` (GET):** API. To be moved to `lectureRoutesApi.js` as `/api/lectures/my-released`.
    *   **`/submit-lecture-for-approval` (POST):** API. To be moved to `lectureRoutesApi.js` as `/api/lectures/submit-for-approval`.
    *   **`/approve-lecture` (POST):** API. To be moved to `lectureRoutesApi.js` as `/api/lectures/approve`.
    *   **`/deny-lecture` (POST):** API. To be moved to `lectureRoutesApi.js` as `/api/lectures/deny`.
    *   **`/send-system-message` (POST):** API. To be moved to `messageRoutesApi.js` or a new `systemMessageRoutesApi.js` as `/api/system/message` or similar.

6.  **Ad-hoc root handlers in `server.js`**:
    *   **`/am-admin` (GET), `/am-educator` (GET):**
    *   **Target:** Remove these root-level handlers. The existing `/api/am-admin` and `/api/am-educator` (also in `server.js`) will be the sole endpoints.

7.  **Files for Deletion (as per SOW after migrations):**
    *   `routes.js`
    *   `src/routes/legacyRoutes.js`

## Acceptance tests:
- This document accurately reflects all non-modular/legacy API endpoints.
- All files mentioned in the SOW deliverable "Migration of every remaining legacy file" have been identified.

## Est. time: < 1 h (Actual: ~1h including review and documentation)

---
This milestone (M1) is now complete. 