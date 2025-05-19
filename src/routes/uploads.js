const express = require('express');
const { setupMulter } = require('../../routesfunctions');
const { 
  EncounterUploadHandler,
  BadgeUploadHandler,
  CharacterUploadHandler,
  BackdropUploadHandler,
  ProfileUploadHandler,
  InstructionUploadHandler
} = require('../../imageHandlers');

const router = express.Router();

// Health probe – used by Self-Test page
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------------- Image Upload Endpoints ----------------
// Retain existing URLs (now under /api/uploads/...)

// Encounter image uploads
router.post(
  '/encounters',
  setupMulter('public/images/uploads/encounters/').single('image'),
  EncounterUploadHandler
);

// Backdrop images
router.post(
  '/backdrops',
  setupMulter('public/images/uploads/backdrops/').single('image'),
  BackdropUploadHandler
);

// Character images
router.post(
  '/characters',
  setupMulter('public/images/uploads/characters/').single('image'),
  CharacterUploadHandler
);

// Badge images
router.post(
  '/badges',
  setupMulter('public/images/uploads/badges/').single('image'),
  BadgeUploadHandler
);

// Student Instruction images
router.post(
  '/instructions',
  setupMulter('public/images/uploads/instructions/').single('image'),
  InstructionUploadHandler
);

// Profile pictures
router.post(
  '/profiles',
  setupMulter('public/images/uploads/profiles/').single('image'),
  ProfileUploadHandler
);

module.exports = router; 