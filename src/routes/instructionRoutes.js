const express = require('express');
const router = express.Router();

const { updateInstructionField } = require('../../studentInstructionOperations');
const {
  GetInstructionData,
  GetAllInstructionData,
} = require('../../routesfunctions');
const { dbPromise } = require('../../db');
const {
  validateRequiredFields,
  isValidFieldName,
  sanitizeValue,
  handleErrorResponse,
} = require('../../utils');

// -------------------------------------------------------------------------
//  CRUD – Student Instructions
// -------------------------------------------------------------------------

// [POST] /update-instruction-field
router.post('/update-instruction-field', (req, res) => {
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

  updateInstructionField(id, field, sanitizedValue)
    .then(() => res.status(200).json({ message: 'Field updated successfully' }))
    .catch((error) => handleErrorResponse(error, res, 'Error updating instruction field.'));
});

// [POST] /delete-instruction
router.post('/delete-instruction', async (req, res) => {
  const { ID } = req.body;
  const validation = validateRequiredFields(req.body, ['ID']);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields: validation.missingFields,
    });
  }
  try {
    await dbPromise.query('DELETE FROM StudentInstructions WHERE ID = ?', [ID]);
    res.status(200).json({ message: 'Instruction deleted successfully' });
  } catch (error) {
    console.error('Error deleting instruction:', error);
    res.status(500).json({ error: `Error deleting instruction: ${error.message}` });
  }
});

// [GET] /GetInstructionData/:id
router.get('/GetInstructionData/:id', (req, res) => {
  const instructionId = req.params.id;
  if (isNaN(instructionId) || parseInt(instructionId) <= 0) {
    return res.status(400).json({ error: 'Invalid instruction ID' });
  }
  GetInstructionData(parseInt(instructionId))
    .then((data) => res.json(data))
    .catch((err) => handleErrorResponse(err, res, 'Server error'));
});

// [GET] /GetAllInstructionData
router.get('/GetAllInstructionData', (_req, res) => {
  GetAllInstructionData()
    .then((data) => res.json(data))
    .catch((err) => {
      console.error(err);
      res.status(500).send('Server error');
    });
});

// Health probe
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'instructions' }));

module.exports = router; 