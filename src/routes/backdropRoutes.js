const express = require('express');
const router = express.Router();

const { updateBackdropField } = require('../../backdropOperations');
const {
  GetBackdropData,
  GetAllBackdropData,
} = require('../../routesfunctions');
const { dbPromise } = require('../../db');
const {
  validateRequiredFields,
  isValidFieldName,
  sanitizeValue,
  handleErrorResponse,
} = require('../../utils');

// -------------------------------------------------------------------------
//  CRUD – Backdrop model
// -------------------------------------------------------------------------

// [POST] /update-backdrop-field
router.post('/update-backdrop-field', (req, res) => {
  const { id, field, value } = req.body;

  const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields: validation.missingFields,
    });
  }
  if (!isValidFieldName(field)) {
    return res.status(400).json({ error: 'Invalid field name' });
  }
  const sanitizedValue = sanitizeValue(value);

  updateBackdropField(id, field, sanitizedValue)
    .then(() => res.status(200).json({ message: 'Field updated successfully' }))
    .catch((error) => handleErrorResponse(error, res, 'Error updating backdrop field.'));
});

// [POST] /delete-backdrop
router.post('/delete-backdrop', async (req, res) => {
  const { ID } = req.body;
  const validation = validateRequiredFields(req.body, ['ID']);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields: validation.missingFields,
    });
  }
  try {
    await dbPromise.query('DELETE FROM Backdrops WHERE ID = ?', [ID]);
    res.status(200).json({ message: 'Backdrop deleted successfully' });
  } catch (error) {
    console.error('Error deleting backdrop:', error);
    res.status(500).json({ error: `Error deleting backdrop: ${error.message}` });
  }
});

// [GET] /GetBackdropData/:id
router.get('/GetBackdropData/:id', (req, res) => {
  const backdropId = req.params.id;
  if (isNaN(backdropId) || parseInt(backdropId) <= 0) {
    return res.status(400).json({ error: 'Invalid backdrop ID' });
  }
  GetBackdropData(parseInt(backdropId))
    .then((data) => res.json(data))
    .catch((err) => handleErrorResponse(err, res, 'Server error'));
});

// [GET] /GetAllBackdropData
router.get('/GetAllBackdropData', (_req, res) => {
  GetAllBackdropData()
    .then((data) => res.json(data))
    .catch((err) => {
      console.error(err);
      res.status(500).send('Server error');
    });
});

// Health probe
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'backdrops' }));

module.exports = router; 