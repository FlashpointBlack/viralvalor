# REST API Documentation

> Version: 2025-05-19 (M7 Alias Removal Complete) – All domain routes reside under `/api/*`; root-level legacy aliases have been removed.

## Health Checks

Each domain router exposes a lightweight JSON health endpoint. These are intended for monitoring/uptime tools.

| Service | Path |
|---------|------|
| Authentication | `/api/auth/health` |
| Uploads / Images | `/api/uploads/health` |
| Lectures | `/api/lectures/health` |
| Encounters / Storylines | `/api/encounters/health` |
| Question Bank | `/api/questions/health` |
| Badges | `/api/badges/health` |
| Characters | `/api/characters/health` |
| Backdrops | `/api/backdrops/health` |
| Student Instructions | `/api/instructions/health` |
| Tags | `/api/tags/health` |

A successful request returns:
```json
{ "status": "ok", "service": "<name>" }
```

## Encounter & Storyline

All encounter endpoints are grouped beneath `/api/encounters`. **The root-level `/encounters/*` alias was removed in M7 – update all clients accordingly.**

> NOTE: `:id` parameters must be numeric.

### Read-only
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/encounters/GetEncounterData/:id` | Fetch full encounter object (with routes & images). |
| GET | `/api/encounters/unlinked-encounters` | List encounters that aren't referenced by any `EncounterRoutes`. |
| GET | `/api/encounters/root-encounters` | List root-level encounters (optionally `?scope=public`). |

### Mutating / Admin
| Method | Path | Body Fields | Description |
|--------|------|-------------|-------------|
| POST | `/api/encounters/create-blank-encounter` | `userSub` | Create empty root encounter. |
| POST | `/api/encounters/update-encounter-field` | `id`, `field`, `value` | Generic field updater (owner/admin only). |
| POST | `/api/encounters/duplicateEncounter` | `encounterId`, `userSub` | Deep-copy encounter for given user. |
| POST | `/api/encounters/create-encounter-choice` | `EncounterID`, `UserSub` | Add blank route originating from encounter. |
| POST | `/api/encounters/update-encounter-choice` | `ID`, `Title` | Rename route. |
| POST | `/api/encounters/delete-encounter-choice` | `ID` | Remove route. |
| POST | `/api/encounters/set-receiving-encounter` | `RouteID`, `selectedEncounterID` | Link route → destination encounter (null to unlink). |
| POST | `/api/encounters/delete-root-encounter` | `rootEncounterId` | Permanently delete scenario tree (owner/admin). |

### SPA / Legacy Display Paths _(unchanged)_
These still resolve to the React SPA and are not handled by the API layer:
- `/encounter-display`
- `/encounters2/:id`
- `/game/:gameId/encounter/:id`

---

### Authentication & Authorization Rules
- Requests **must** include an Auth0 `sub` either via session (`req.oidc.user.sub`) **or** `x-user-sub` header.
- Admins can always access/modify any encounter.
- Non-admin users can only see/edit their own encounters unless the optional `?scope=public` flag is provided (read-only).

---

_Domain-specific docs for Lectures, Questions, Images, Badges, Characters, Backdrops, Instructions, and Tags now reside alongside their respective routers (`/docs/<domain>.md`)._