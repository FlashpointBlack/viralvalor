# M6 Manual Regression Checklist

> Purpose: A human-driven walkthrough that mirrors real-world usage via browser or Postman. Follow the sequence below on a **fresh DB snapshot**. Record PASS / FAIL and any notes. Where self-tests exist, this checklist validates the same flow from the outside.

## Preparation
1. Ensure the server is running locally (`NODE_ENV=development`)
2. Reset / seed the database with the standard fixture snapshot.
3. Launch Postman (or preferred REST client) with the environment «local-api». Base URL: `http://localhost:3000`.
4. Authenticate if route requires it (use admin JWT token from secrets vault).

Legend: `[GET]`, `[POST]`; `→` expected result or observation.

---

## Characters
1. [GET] `/GetAllCharacterData` → 200; array ≥ 0 length; each item includes `CharacterID`, `Name`.
2. [GET] `/GetCharacterData/1` → 200; body `CharacterID` == 1.
3. [POST] `/update-character-field` { "id":1, "field":"Name", "value":"TestRenamed" } → 200; follow-up GET shows updated value.
4. [POST] `/delete-character` { "id":1 } → 200; follow-up GET returns 404.
5. [POST] `/images/uploads/characters/` (multipart file `avatar.png`) → 201; response URL reachable in browser.

## Backdrops
6. [GET] `/GetAllBackdropData` → 200; JSON array.
7. [GET] `/GetBackdropData/1` → 200; `BackdropID` == 1.
8. [POST] `/update-backdrop-field` { "id":1,"field":"Label","value":"Night City"} → 200; verify change.
9. [POST] `/delete-backdrop` { "id":1 } → 200; confirm deletion.
10. [POST] `/images/uploads/backdrops/` (multipart `scene.jpg`) → 201; URL returns 200.

## Badges
11. [GET] `/GetAllBadgesData` → 200; array.
12. [GET] `/GetBadgeData/1` → 200; `BadgeID` 1.
13. [POST] `/update-badge-field` { "id":1,"field":"Title","value":"Beta Tester"} → 200.
14. [POST] `/delete-badge` { "id":1 } → 200.
15. [POST] `/images/uploads/badges/` (`badge.png`) → 201; URL ok.

## Instructions
16. [GET] `/GetAllInstructionData` → 200; array.
17. [GET] `/GetInstructionData/1` → 200; `InstructionID` 1.
18. [POST] `/update-instruction-field` { "id":1,"field":"Body","value":"Updated text"} → 200.
19. [POST] `/delete-instruction` { "id":1 } → 200.
20. [POST] `/images/uploads/instructions/` (`guide.pdf`) → 201; URL ok.

## Encounters
21. [GET] `/GetEncounterData/1` → 200; `EncounterID` 1.
22. [GET] `/unlinked-encounters` → 200; array-only encounters without parent.
23. [GET] `/root-encounters` → 200; array of roots.
24. [POST] `/create-blank-encounter` {"title":"Blank"} → 201; response includes new ID.
25. [POST] `/update-encounter-field` {"id":NEW_ID,"field":"Title","value":"Edited"} → 200.
26. [POST] `/duplicateEncounter` {"id":NEW_ID} → 201; response includes DUP_ID.
27. [POST] `/create-encounter-choice` {"encounterId":NEW_ID,"choiceText":"Go left"} → 201.
28. [POST] `/update-encounter-choice` {"choiceId":CH_ID,"choiceText":"Go right"} → 200.
29. [POST] `/delete-encounter-choice` {"choiceId":CH_ID} → 200.
30. [POST] `/set-receiving-encounter` {"choiceId":CH_ID,"receivingEncounterId":DUP_ID} → 200.
31. [POST] `/delete-root-encounter` {"id":NEW_ID} → 200.
32. [POST] `/images/uploads/encounters/` (`encounter.jpg`) → 201; URL valid.

## Uploads
33. [POST] `/images/uploads/profiles/` (`profile.png`) → 201; returned URL accessible.

## Tags
34. [GET] `/tags` → 200; array.
35. [POST] `/create-tag` {"name":"Sci-Fi"} → 201; GET shows new tag.

## Health Checks
36-42. For each path in table below, expect 200 JSON `{ status: "ok" }`.

| Path |
|------|
| /api/characters/health |
| /api/backdrops/health |
| /api/badges/health |
| /api/instructions/health |
| /api/encounters/health |
| /api/tags/health |
| /api/uploads/health |

---

## Completion
- Mark each step PASS/FAIL in a copy of this document during the run.
- File an issue immediately for any FAIL.
- When all green, sign-off here: `QA Lead ______  Date ____` 