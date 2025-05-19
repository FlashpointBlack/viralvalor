const express = require('express');
const router = express.Router();

// External helpers re-used from the legacy bundle
const { updateBadgeField } = require('../../badgeOperations');
const {
  GetBadgeData,
  GetAllBadgesData,
} = require('../../routesfunctions');
const { dbPromise } = require('../../db');

// Shared utilities – validate & sanitise input; catch DB errors consistently
const {
  validateRequiredFields,
  isValidFieldName,
  sanitizeValue,
  handleErrorResponse,
} = require('../../utils');

/**
 * Tiny helper: extracts the Auth0 sub either from the session (Auth0/OIDC)
 * or from the fallback `x-user-sub` HTTP header used by integration tests.
 */
function getRequestSub(req) {
  return (
    (req.oidc && req.oidc.user && req.oidc.user.sub) ||
    req.headers['x-user-sub']
  );
}

// -------------------------------------------------------------------------
//  CRUD – Badge model
// -------------------------------------------------------------------------

// [POST] /update-badge-field
router.post('/update-badge-field', (req, res) => {
  const { id, field, value } = req.body;

  // Check required fields exist
  const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields: validation.missingFields,
    });
  }

  // Ensure column name safe to inject into SQL statement
  if (!isValidFieldName(field)) {
    return res.status(400).json({ error: 'Invalid field name' });
  }

  // Sanitise value (rudimentary)
  const sanitizedValue = sanitizeValue(value);

  updateBadgeField(id, field, sanitizedValue)
    .then(() => res.status(200).json({ message: 'Field updated successfully' }))
    .catch((error) => handleErrorResponse(error, res, 'Error updating badge field.'));
});

// [POST] /delete-badge
router.post('/delete-badge', async (req, res) => {
  const { ID } = req.body;

  const validation = validateRequiredFields(req.body, ['ID']);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields: validation.missingFields,
    });
  }

  try {
    await dbPromise.query('DELETE FROM Badges WHERE ID = ?', [ID]);
    res.status(200).json({ message: 'Badge deleted successfully' });
  } catch (error) {
    console.error('Error deleting badge:', error);
    res.status(500).json({ error: `Error deleting badge: ${error.message}` });
  }
});

// [GET] /GetBadgeData/:id
router.get('/GetBadgeData/:id', (req, res) => {
  const badgeId = req.params.id;

  // Must be numeric and > 0.
  if (isNaN(badgeId) || parseInt(badgeId) <= 0) {
    return res.status(400).json({ error: 'Invalid badge ID' });
  }

  GetBadgeData(parseInt(badgeId))
    .then((data) => res.json(data))
    .catch((err) => handleErrorResponse(err, res, 'Server error'));
});

// [GET] /GetAllBadgesData
router.get('/GetAllBadgesData', (_req, res) => {
  GetAllBadgesData()
    .then((data) => res.json(data))
    .catch((err) => {
      console.error(err);
      res.status(500).send('Server error');
    });
});

// -------------------------------------------------------------------------
//  Health-check – for admin self-test page
// -------------------------------------------------------------------------
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'badges' }));

module.exports = router; 