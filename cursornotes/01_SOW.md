# Statement of Work (SOW) – Phase II: **Retire Legacy Router & Enforce Single `/api/*` Surface**

## Goal
Complete the routing modernisation by *removing* the legacy `setupRoutes()` bundle and guaranteeing that **all** HTTP endpoints live inside `src/routes/` and are exposed solely at the `/api/*` path prefix.

## Deliverables
- [ ] Migration of every remaining legacy file (`userRoutes.js`, `messageRoutes.js`, `journalRoutes.js`, `selfTestRoutes.js`, and any ad-hoc handlers embedded in `server.js`) into domain routers under `src/routes/`.
- [ ] Deletion of `routes.js` and `src/routes/legacyRoutes.js` (after a deprecation period) plus the fallback mounts in `server.js`.
- [ ] 301 redirect middleware for *one* release cycle to forward old root-level URLs (`/users`, `/messages`, etc.) to their new `/api/*` counterparts, emitting a `Deprecation` response header.
- [ ] Updated API documentation & README.
- [ ] Updated admin *self-test* page covering the migrated domains.
- [ ] End-to-end regression verification log stored in `/cursornotes/testing/phase2_final_checks.md`.
- [ ] Post-migration metrics comparison (start-up time, memory) noted in the same log.

## Out-of-scope
- React SPA refactors beyond updating fetch baseURLs where needed (expected zero).
- Any DB schema or business-logic changes unrelated to routing paths.
- Performance tuning not directly linked to router removal.

## Dependencies
- Express 4.x
- Auth0 OIDC middleware (`express-openid-connect`)
- MySQL connection via `dbPromise`
- Existing logging & error-handling middlewares

## Milestones

| # | Title | Est. Time | Status |
|---|-------|-----------|--------|
| M1 | Inventory & gap analysis of remaining *non-modular* endpoints | 2 h | **TODO** |
| M2 | Extract **User** endpoints into `src/routes/userRoutesApi.js` | 4 h | **TODO** |
| M3 | Extract **Message** endpoints into `src/routes/messageRoutesApi.js` | 4 h | **TODO** |
| M4 | Extract **Journal** endpoints into `src/routes/journalRoutesApi.js` | 3 h | **TODO** |
| M5 | Extract **Self-Test** endpoints into `src/routes/selfTestRoutesApi.js` | 3 h | **TODO** |
| M6 | Implement redirect shim & monitor logs (24 h window) | 1 h (+ passive) | **TODO** |
| M7 | Purge legacy files & mounts, update docs, run full regression | 3 h | **TODO** |
| M8 | Compile performance & stability report | 1 h | **TODO** |

*All milestones ≤ 8 work-hours as required.*

## Timeline (draft)
- Kick-off: 2025-05-25
- M1–M4: 2025-05-25 ⟶ 2025-05-26
- M5–M6: 2025-05-26 ⟶ 2025-05-27
- Deprecation monitoring window ends: 2025-05-28
- M7–M8 & project close-out: 2025-05-29

## Progress Log
*This section auto-appends status from `/cursornotes/daily_YYYY-MM-DD.log` entries.*

---

## Technical Rationale
1. **Single source of truth** – Developers locate an endpoint by searching `src/routes/*` exclusively.
2. **Collision avoidance** – Eliminates duplicate handlers (`/api/users` vs `/users`). Middlewares (auth, CORS, rate-limits) are applied exactly once.
3. **Operational simplicity** – Start-up serialization drops by ~10 kLOC; memory footprint shrinks; log noise from duplicated mounts disappears.
4. **Easier future work** – Enables automated OpenAPI generation, versioning, and global caching logic at the `/api` root.

## Acceptance Criteria
- `git grep "setupRoutes("` returns **no matches**.
- `node server.js` boots without references to removed files.
- Hitting any pre-existing public API URL returns identical JSON payloads or issues a 301 redirect with `Deprecation` header.
- Admin self-test page shows **green** across *User*, *Message*, *Journal*, and *Self-Test* sections.
- Performance report documents ≥ 10 % improvement in start-up time or memory vs baseline.

---

_Last updated: 2025-05-24 – initial SOW drafted._ 