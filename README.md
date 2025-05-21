# Viral Valor – Backend

This Node / Express backend powers the Viral Valor SPA. The codebase has completed a refactor from a monolithic `routes.js` file to a **domain-driven router architecture** under `src/routes/`.

## Key Points

1. **Stable Public API** – All HTTP endpoints now live exclusively under the `/api/*` namespace. The temporary root-level aliases were removed in Milestone 7, so be sure every request is prefixed with `/api`.
2. **Health Endpoints** – Every router exposes `/health` for monitoring (see docs/API.md).
3. **Admin Self-Test** – Navigate to `/api/selftest/` (admin-only) to run comprehensive integration checks that exercise database helpers and HTTP endpoints.

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

## Development

Ensure you have `nodemon` installed globally (`npm i -g nodemon`).

### Local Environment Setup

1.  **Database:** Ensure MySQL is running and accessible. Create a database (e.g., `viralvalor`) and a user with privileges.
2.  **Environment Variables:** Copy `.env.example` to `.env` and populate with your local database credentials, Auth0 settings, OpenAI key, etc.
    *   `cp .env.example .env`
3.  **Dependencies:** Install Node.js packages:
    *   `npm install`
4.  **Database Migrations:** Apply database migrations. The specific command might vary based on the migration tool being used (e.g., if using Knex: `npx knex migrate:latest`).  *Currently, migrations might be manual or part of app startup logic if no dedicated tool is integrated.*
5.  **Run the Application:**
    *   `npm start` (or `nodemon server.js` or relevant script)

The application should typically be available at `http://localhost:3000` (or the port specified in your `.env`).

### Admin Self-Test Page (Obsolete)

This section is obsolete as the self-test page has been removed and is being replaced by a Site Health dashboard.

---

Full endpoint reference lives in [`docs/API.md`](docs/API.md). 