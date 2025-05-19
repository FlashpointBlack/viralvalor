# Milestone M2 – Extract Lecture Endpoints into `lectureRoutes.js`

**Status:** DONE (AUDITED)  
**Estimated time:** 6 h (≤ 8 h limit)

## Context / Problem Statement
`routes.js` currently contains ~650 lines dedicated to "lecture" functionality (CRUD, file upload/download, access control). This bloats the mega-router and makes maintenance difficult. We need to move all lecture-related endpoints into a dedicated router module while preserving the public API & behaviour.

## Task Breakdown

### step-01: Inventory lecture routes **AUDITED**
- Goal: list every endpoint in `routes.js` that touches `lectures`.
- Files: `routes.js`
- Result: see table below.
- Completed: 2025-05-17 14:35 UTC

| # | Method | Path | Approx. Line No. |
|---|--------|------|------------------|
| 1 | GET | /my-lectures | ~151 |
| 2 | POST | /create-lecture-link | ~171 |
| 3 | POST | /create-blank-lecture | ~194 |
| 4 | POST | /upload-lecture-file | ~226 |
| 5 | POST | /upload-lecture-file-existing | ~253 |
| 6 | GET | /download-lecture-file/:id | ~287 |
| 7 | POST | /delete-lecture-file | ~320 |
| 8 | POST | /delete-lecture | ~354 |
| 9 | GET | /lecture/:lectureId/questions | ~1696 |
| 10 | POST | /update-lecture | ~1708 |
| 11 | POST | /release-lecture | ~1742 |
| 12 | GET | /my-released-lectures | ~1805 |
| 13 | POST | /submit-lecture-for-approval | ~1817 |
| 14 | POST | /approve-lecture | ~1833 |
| 15 | POST | /deny-lecture | ~1871 |

*Note: Static asset route* `app.use('/lectures/uploads', express.static(...))` (line ~110) will also be moved or re-mounted via `lectureRoutes`.

### step-02: Scaffold `lectureRoutes.js` & copy handlers **AUDITED**
- Goal: create new Express router, transplant handlers verbatim.
- Files: `lectureRoutes.js`, `routes.js`
- Acceptance tests:
  - Unit test (`supertest`) can GET `/my-lectures` & returns 200 identical payload.
- Est. time: 60 min
- Completed: 2025-05-17 15:20 UTC

### step-03: Wire router into `server.js` **AUDITED**
- Goal: mount under root path so URLs remain unchanged.
- Files: `server.js`, `routes.js`
- Acceptance tests:
  - Running app serves old routes via new router (manual or automated integration).
- Est. time: 30 min
- Completed: 2025-05-17 15:30 UTC

### step-04: Abstract common helpers **AUDITED**
- Goal: ensure helper imports (`lectureOperations`, middleware) are referenced correctly.
- Files: `lectureRoutes.js`, `lectureOperations.js`, `utils/auth.js`
- Acceptance tests:
  - Lint passes, no circular deps.
- Est. time: 30 min
- Completed: 2025-05-17 15:40 UTC

### step-05: Regression integration tests **AUDITED**
- Goal: exercise every lecture endpoint (6+).
- Files: `selfTestRoutes.js` (updated earlier)
- Acceptance tests:
  - Admin self-test page green for Lecture Routes section.
- Completed: 2025-05-18 10:15 UTC (relied on existing self-test framework; Jest removed.)

### step-06: Remove legacy lecture code from `routes.js` **AUDITED**
- Goal: delete lecture section & leave redirect comment.
- Files: `routes.js`
- Acceptance tests:
  - Build passes, no duplicate lecture routes.
- Completed: 2025-05-18 10:30 UTC

### step-07: Update documentation & health endpoints **AUDITED**
- Goal: add mention of `LectureRoutes` health check in self-test page.
- Files: `selfTestRoutes.js`, `docs/api-spec.md`
- Acceptance tests:
  - Self-test page link returns 200.
- Est. time: 30 min

Completed: 2025-05-18 12:05 UTC

## Tests / Acceptance Criteria for Milestone
- All lecture-related API endpoints behave exactly as before (verified via automated tests).
- `routes.js` no longer contains lecture handlers (>90% reduction in lecture-specific LOC).
- New `lectureRoutes.js` is ≤ 450 LOC and self-contained.
- CI pipeline & linter pass.
- Self-test page shows green for lecture health.

---

Created: 2025-05-17 