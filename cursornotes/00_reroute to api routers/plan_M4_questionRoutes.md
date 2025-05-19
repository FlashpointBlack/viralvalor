# Plan – M4: Question Bank Routes Extraction

### Context / Problem Statement
The monolithic `routes.js` still contains all **question-bank** (quiz/question) endpoints.  To complete the modularisation effort, these endpoints must be migrated into a dedicated `questionRoutes.js` module **without changing any public URLs or behaviour**.

---

## Task Breakdown

### step-01: Inventory existing endpoints  **AUDITED**
- Goal: List every `/question`, `/questions`, or related endpoint in `routes.js` and map HTTP methods, middleware, helper calls.
- Files: `routes.js` (read-only), `cursornotes/plan_M4_questionRoutes.md` (update catalogue)
- Acceptance tests: Add a bullet list under **Endpoints Catalogue** section with method + path.
- Est. time: < 1 h

### step-02: Scaffold `questionRoutes.js`  **AUDITED**
- Goal: Create new Express router, add placeholder 501 handlers and `/health` probe.
- Files: `src/routes/questionRoutes.js` (new), `src/routes/index.js` (add mount)
- Acceptance tests: Admin self-test page shows Question Routes block with all placeholders returning 501.
- Est. time: < 1 h

### step-03: Migrate read-only (GET) endpoints  **AUDITED**
- Goal: Move all GET endpoints (e.g. listing, fetching single question) while ensuring identical JSON output.
- Files: `src/routes/questionRoutes.js`, helper modules as needed
- Acceptance tests: Supertest confirms each GET returns 200 with unchanged schema.
- Est. time: < 1 h

### step-04: Migrate mutating (POST/PUT/DELETE) endpoints  **AUDITED**
- Goal: Migrate create / update / delete question & option endpoints, preserve auth/ACL logic.
- Files: `src/routes/questionRoutes.js`, helpers if refactored
- Acceptance tests: Admin self-test block (added later) passes for these endpoints.
- Est. time: < 1 h

### step-05: Wire router & legacy alias  **AUDITED**
- Goal: Mount `questionRoutes` in `server.js` via `/api/questions`; add compatibility alias in `server.js` if legacy paths exist without prefix.
- Files: `server.js`, `src/routes/questionRoutes.js`
- Acceptance tests: Old paths (if any) continue to work; new `/api/questions/...` works.
- Est. time: < 0.5 h

### step-06: Integration & regression tests  **AUDITED**
- Goal: Extend admin self-test page with "Question Routes (HTTP)" block covering every endpoint.
- Files: `selfTestRoutes.js`, possibly `src/routes/questionRoutes.js`
- Acceptance tests: All tests green in browser; console clear.
- Est. time: < 1 h

### step-07: Clean-up & documentation  **AUDITED**
- Goal: Remove legacy question code from `routes.js`, update API docs/README, ensure `/api/questions/health` documented.
- Files: `routes.js`, `docs/API.md`, `README.md`
- Acceptance tests: `routes.js` no longer contains question logic; docs reflect new path.
- Est. time: < 1 h

*Legacy question-bank endpoints removed from `routes.js`; docs & README updated with `/api/questions/health`.*

---

## Endpoints Catalogue  
*To be completed in **step-01***

| # | Method | Path | Approx. Line No. |
|---|--------|------|------------------|
| 1 | POST | /create-blank-question | ~522 |
| 2 | POST | /update-question-field | ~555 |
| 3 | POST | /delete-question | ~588 |
| 4 | POST | /create-question-option | ~610 |
| 5 | POST | /update-question-option | ~633 |
| 6 | POST | /delete-question-option | ~656 |
| 7 | POST | /set-correct-option | ~677 |
| 8 | GET | /my-questions | ~696 |
| 9 | GET | /get-question/:id | ~715 |
| 10 | POST | /set-question-tags | ~778 |
| 11 | GET | /questions-by-tag/:tagId | ~805 |
| 12 | GET | /student-questions | ~892 |
| 13 | GET | /student-question/:id | ~900 |
| 14 | POST | /record-question-attempt | ~909 |
| 15 | GET | /my-question-attempts | ~925 |
| 16 | GET | /my-question-stats | ~938 |
| 17 | GET | /admin/question-stats | ~952 |
| 18 | GET | /admin/question-stats-by-question | ~969 |
| 19 | GET | /admin/question-stats-by-tag | ~986 |
| 20 | GET | /lecture/:lectureId/questions | ~1008 |
| 21 | GET | /my-question-stats-by-tag | ~1241 |

---

Status tags: **TODO**, **IN-PROGRESS**, **BLOCKED**, **DONE** 