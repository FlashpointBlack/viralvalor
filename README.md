# Viral Valor – Backend

This Node / Express backend powers the Viral Valor SPA. The codebase is currently undergoing an incremental refactor from a monolithic `routes.js` file to a **domain-driven router architecture** under `src/routes/`.

## Key Points

1. **Stable Public API** – All HTTP endpoints now live exclusively under the `/api/*` namespace. The temporary root-level aliases were removed in Milestone 7, so be sure every request is prefixed with `/api`.
2. **Health Endpoints** – Every router exposes `/health` for monitoring (see docs/API.md).
3. **Admin Self-Test** – Navigate to `/api/admin/selftest` (admin-only) to run comprehensive integration checks that exercise database helpers and HTTP endpoints.

## Router Migration Status

| Domain | Router | Health | Status |
|--------|--------|--------|--------|
| Authentication | `src/routes/authRoutes.js` | `/api/auth/health` | ✅ |
| Uploads / Images | `imageRoutes.js` | `/api/uploads/health` | ✅ |
| Lectures | `lectureRoutes.js` | `/api/lectures/health` | ✅ |
| Encounters / Storylines | `src/routes/encounterRoutes.js` | `/api/encounters/health` | ✅ |
| Question Bank | `src/routes/questionRoutes.js` | `/api/questions/health` | ✅ |
| Badges | `src/routes/badgeRoutes.js` | `/api/badges/health` | ✅ |
| Characters | `src/routes/characterRoutes.js` | `/api/characters/health` | ✅ |
| Backdrops | `src/routes/backdropRoutes.js` | `/api/backdrops/health` | ✅ |
| Student Instructions | `src/routes/instructionRoutes.js` | `/api/instructions/health` | ✅ |
| Tags | `src/routes/tagRoutes.js` | `/api/tags/health` | ✅ |
| Legacy Fallback | `src/routes/legacyRoutes.js` | `/api/legacy-health` | ✅ |

## Development

```bash
npm install
npm run dev  # nodemon server.js
```

The server automatically mounts all routers from `src/routes/index.js` under `/api`.

---

Full endpoint reference lives in [`docs/API.md`](docs/API.md). 