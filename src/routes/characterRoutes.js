const express = require('express');
const router = express.Router();

const { updateCharacterField } = require('../../characterOperations');
const {
  GetCharacterData,
  GetAllCharacterData,
} = require('../../routesfunctions');
const { dbPromise } = require('../../db');
const {
  validateRequiredFields,
  isValidFieldName,
  sanitizeValue,
  handleErrorResponse,
} = require('../../utils');

// -------------------------------------------------------------------------
//  CRUD – Character model
// -------------------------------------------------------------------------

// [POST] /update-character-field
router.post('/update-character-field', (req, res) => {
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

  updateCharacterField(id, field, sanitizedValue)
    .then(() => res.status(200).json({ message: 'Field updated successfully' }))
    .catch((error) => handleErrorResponse(error, res, 'Error updating character field.'));
});

// [POST] /delete-character
router.post('/delete-character', async (req, res) => {
  const { ID } = req.body;
  const validation = validateRequiredFields(req.body, ['ID']);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields: validation.missingFields,
    });
  }
  try {
    await dbPromise.query('DELETE FROM CharacterModels WHERE ID = ?', [ID]);
    res.status(200).json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Error deleting character:', error);
    res.status(500).json({ error: `Error deleting character: ${error.message}` });
  }
});

// [GET] /GetCharacterData/:id
router.get('/GetCharacterData/:id', (req, res) => {
  const characterId = req.params.id;
  if (isNaN(characterId) || parseInt(characterId) <= 0) {
    return res.status(400).json({ error: 'Invalid character ID' });
  }
  GetCharacterData(parseInt(characterId))
    .then((data) => res.json(data))
    .catch((err) => handleErrorResponse(err, res, 'Server error'));
});

// [GET] /GetAllCharacterData
router.get('/GetAllCharacterData', (_req, res) => {
  GetAllCharacterData()
    .then((data) => res.json(data))
    .catch((err) => {
      console.error(err);
      res.status(500).send('Server error');
    });
});

// Health probe
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'characters' }));

module.exports = router; 