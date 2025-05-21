const express = require('express');

// ---------------------------------------------------------------------------
//  Encounter & Storyline Routes – INITIAL STUB
//  This router mirrors the historical endpoints listed in
//  /cursornotes/plan_M3_encounterRoutes.md. For now each handler simply
//  returns HTTP 501 (Not Implemented). Real logic will be migrated in
//  subsequent steps (step-03 / step-04 of the plan).
// ---------------------------------------------------------------------------

const router = express.Router();

// Add additional imports for helpers and DB
const { GetEncounterData } = require('../../routesfunctions');
const {
  createBlankEncounter,
  updateEncounterField,
  duplicateEncounter,
  createEncounterChoice,
  updateEncounterChoice,
  deleteEncounterChoice,
  setReceivingEncounter,
  getUnlinkedEncounters,
  deleteRootEncounter
} = require('../../encounterOperations');
const { isUserAdminBySub } = require('../../utils/auth');
const {
  handleErrorResponse,
  validateRequiredFields,
  isValidFieldName,
  sanitizeValue
} = require('../../utils');
const { dbPromise } = require('../../db');

// Helper to register stub endpoints quickly
function addStub(method, path) {
  router[method](path, (_req, res) => res.status(501).json({ error: 'Not implemented – M3 in progress' }));
}

// Inventory sourced from the Endpoints Catalogue (plan_M3_encounterRoutes.md)
const stubs = [
  // SPA redirects / legacy HTML – still exposed for parity. Keeping GET only.
  { method: 'get',  path: '/encounter-display' },
  { method: 'get',  path: '/encounters2/:id' },
  { method: 'get',  path: '/game/:gameId/encounter/:id' }
];

stubs.forEach(({ method, path }) => addStub(method, path));

// Basic health-check endpoint (requirement from SOW)
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'encounters' }));

// --------------------- REAL GET ENDPOINTS -----------------------------
// GET /GetEncounterData/:id – full scenario data with ownership/auth checks
router.get('/GetEncounterData/:id', async (req, res) => {
  const encounterId = req.params.id;
  const requestedScope = req.query.scope; // optional query param

  // Basic validation – must be positive integer
  if (isNaN(encounterId) || parseInt(encounterId) <= 0) {
    return res.status(400).json({ error: 'Invalid encounter ID' });
  }

  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  // Require authentication (aligns with historical behaviour)
  if (!requestSub) {
    return res.status(401).json({ error: 'User sub not provided' });
  }

  const isAdminFlag = await isUserAdminBySub(requestSub);
  let accessGranted = false;

  if (isAdminFlag) {
    accessGranted = true;
  } else if (requestedScope === 'public') {
    accessGranted = true;
  } else {
    const isOwnerFlag = await isEncounterOwner(encounterId, requestSub);
    accessGranted = isOwnerFlag;
  }

  if (!accessGranted) {
    return res.status(403).json({ error: 'You do not have permission to view this scenario' });
  }

  try {
    const data = await GetEncounterData(parseInt(encounterId));

    if (!data || !data.Encounter) {
      return res.status(404).json({ error: 'Encounter not found' });
    }
    res.json(data);
  } catch (err) {
    handleErrorResponse(err, res, 'Server error retrieving encounter data.');
  }
});

// GET /unlinked-encounters – simple pass-through to helper
router.get('/unlinked-encounters', async (_req, res) => {
  try {
    const results = await getUnlinkedEncounters();
    res.status(200).json(results);
  } catch (err) {
    console.error('[unlinked-encounters] Error', err);
    res.status(500).send('Error fetching unlinked encounters.');
  }
});

// GET /root-encounters – list scenarios (ownership rules)
router.get('/root-encounters', async (req, res, next) => {
  try {
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
    const requestedScope = req.query.scope; // e.g. public

    let sql = 'SELECT ID, Title FROM Encounters WHERE IsRootEncounter = 1';
    const params = [];
    let applyOwnershipFilter = true;

    // Admin bypass + public scope handling
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (isAdminFlag || requestedScope === 'public') {
      applyOwnershipFilter = false;
    } else if (!requestSub) {
      // unauthenticated & not public → empty array (historical behaviour)
      return res.json([]);
    }

    if (applyOwnershipFilter) {
      sql += ' AND _REC_Creation_User = ?';
      params.push(requestSub);
    }

    const finalSql = sql + ' ORDER BY Title';
    const [rows] = await dbPromise.query(finalSql, params);
    res.status(200).json(rows);
  } catch (err) {
    console.error('[root-encounters] Error', err);
    next(err);
  }
});

// --------------------- LOCAL HELPERS -----------------------------

// Ownership check for Encounters – retained from legacy logic
async function isEncounterOwner(encounterId, userSub) {
  if (!userSub) return false;
  try {
    const [rows] = await dbPromise.query(
      'SELECT _REC_Creation_User FROM Encounters WHERE ID = ? LIMIT 1',
      [encounterId]
    );
    return rows.length > 0 && rows[0]._REC_Creation_User === userSub;
  } catch (err) {
    console.error('[isEncounterOwner] DB error', err);
    return false;
  }
}

// Ownership check for EncounterRoutes → traverses to parent encounter
async function isRouteOwner(routeId, userSub) {
  if (!userSub) return false;
  try {
    const [rows] = await dbPromise.query(
      `SELECT e._REC_Creation_User
         FROM EncounterRoutes r
         JOIN Encounters e ON e.ID = r.RelID_Encounter_Calling
        WHERE r.ID = ? LIMIT 1`,
      [routeId]
    );
    return rows.length > 0 && rows[0]._REC_Creation_User === userSub;
  } catch (err) {
    console.error('[isRouteOwner] DB error', err);
    return false;
  }
}

// --------------------- MUTATING ENDPOINTS -----------------------------

// POST /create-blank-encounter
router.post('/create-blank-encounter', async (req, res) => {
  const { userSub } = req.body;

  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  // Validate required fields
  const validation = validateRequiredFields(req.body, ['userSub']);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields: validation.missingFields
    });
  }

  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });

  if (userSub !== requestSub) {
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (!isAdminFlag) return res.status(403).json({ error: 'You can only create encounters for yourself' });
  }

  try {
    const encounterId = await createBlankEncounter(userSub);
    res.status(200).json({ encounterId });
  } catch (err) {
    handleErrorResponse(err, res, 'Error creating blank encounter.');
  }
});

// POST /update-encounter-field
router.post('/update-encounter-field', async (req, res) => {
  const { id, field, value } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }

  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isEncounterOwner(id, requestSub);
  if (!isAdminFlag && !isOwnerFlag) return res.status(403).json({ error: 'You do not have permission to edit this scenario' });

  if (!isValidFieldName(field)) return res.status(400).json({ error: 'Invalid field name' });

  const sanitizedValue = sanitizeValue(value);

  try {
    await updateEncounterField(id, field, sanitizedValue);
    res.status(200).json({ message: 'Field updated successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error updating encounter field.');
  }
});

// POST /duplicateEncounter
router.post('/duplicateEncounter', async (req, res) => {
  const { encounterId, userSub } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  const validation = validateRequiredFields(req.body, ['encounterId', 'userSub']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }

  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  if (userSub !== requestSub && !isAdminFlag) return res.status(403).json({ error: 'You do not have permission to duplicate encounters for another user' });

  try {
    const newEncounterId = await duplicateEncounter(encounterId, userSub);
    res.status(200).json({ newEncounterId });
  } catch (err) {
    handleErrorResponse(err, res, 'Error duplicating record');
  }
});

// POST /create-encounter-choice
router.post('/create-encounter-choice', async (req, res) => {
  const { EncounterID, UserSub } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  const validation = validateRequiredFields(req.body, ['EncounterID', 'UserSub']);
  if (!validation.isValid) return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });

  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isEncounterOwner(EncounterID, requestSub);
  if (!isAdminFlag && !isOwnerFlag) return res.status(403).json({ error: 'You do not have permission to create encounter choice' });

  try {
    const ID = await createEncounterChoice(EncounterID, UserSub);
    res.status(200).json({ ID });
  } catch (err) {
    handleErrorResponse(err, res, 'Error creating encounter choice.');
  }
});

// POST /update-encounter-choice
router.post('/update-encounter-choice', async (req, res) => {
  const { ID, Title } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  const validation = validateRequiredFields(req.body, ['ID', 'Title']);
  if (!validation.isValid) return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });

  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isRouteOwner(ID, requestSub);
  if (!isAdminFlag && !isOwnerFlag) return res.status(403).json({ error: 'You do not have permission to edit this choice' });

  const sanitizedTitle = sanitizeValue(Title);

  try {
    await updateEncounterChoice(ID, sanitizedTitle);
    res.status(200).json({ message: 'Choice updated successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error updating encounter choice.');
  }
});

// POST /delete-encounter-choice
router.post('/delete-encounter-choice', async (req, res) => {
  const { ID } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  const validation = validateRequiredFields(req.body, ['ID']);
  if (!validation.isValid) return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });

  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isRouteOwner(ID, requestSub);
  if (!isAdminFlag && !isOwnerFlag) return res.status(403).json({ error: 'You do not have permission to delete this choice' });

  try {
    await deleteEncounterChoice(ID);
    res.status(200).json({ message: 'Choice deleted successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error deleting encounter choice.');
  }
});

// POST /set-receiving-encounter
router.post('/set-receiving-encounter', async (req, res) => {
  const { RouteID, selectedEncounterID } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  const validation = validateRequiredFields(req.body, ['RouteID']);
  if (!validation.isValid) return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });

  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isRouteOwner(RouteID, requestSub);
  if (!isAdminFlag && !isOwnerFlag) return res.status(403).json({ error: 'You do not have permission to link encounters for this choice' });

  try {
    await setReceivingEncounter(RouteID, selectedEncounterID);
    res.status(200).json({ message: 'Receiving encounter set successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error setting receiving encounter.');
  }
});

// POST /delete-root-encounter
router.post('/delete-root-encounter', async (req, res) => {
  const { rootEncounterId } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

  if (!rootEncounterId) return res.status(400).json({ error: 'Missing required field: rootEncounterId' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isEncounterOwner(rootEncounterId, requestSub);
  if (!isAdminFlag && !isOwnerFlag) return res.status(403).json({ error: 'You do not have permission to delete this scenario' });

  try {
    await deleteRootEncounter(rootEncounterId);
    res.status(200).json({ message: 'Scenario deleted successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error deleting scenario');
  }
});

module.exports = router; 