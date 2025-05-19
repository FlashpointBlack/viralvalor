const { setupMulter } = require('./routesfunctions');
const {
  EncounterUploadHandler,
  BadgeUploadHandler,
  CharacterUploadHandler,
  BackdropUploadHandler,
  ProfileUploadHandler,
  InstructionUploadHandler
} = require('./imageHandlers');

/**
 * Registers all /images upload endpoints on the provided Express app.
 * Extracted from routes.js to reduce file bloat & improve separation of concerns.
 * Maintains existing public API – no URL changes.
 * @param {import('express').Express} app
 */
function setupImageRoutes(app) {
  // Encounter image uploads (currently unused but kept for parity)
  app.post(
    '/images/uploads/encounters/',
    setupMulter('public/images/uploads/encounters/').single('image'),
    EncounterUploadHandler
  );

  // Backdrop images
  app.post(
    '/images/uploads/backdrops/',
    setupMulter('public/images/uploads/backdrops/').single('image'),
    BackdropUploadHandler
  );

  // Character images
  app.post(
    '/images/uploads/characters/',
    setupMulter('public/images/uploads/characters/').single('image'),
    CharacterUploadHandler
  );

  // Badge images
  app.post(
    '/images/uploads/badges/',
    setupMulter('public/images/uploads/badges/').single('image'),
    BadgeUploadHandler
  );

  // Student Instruction images
  app.post(
    '/images/uploads/instructions/',
    setupMulter('public/images/uploads/instructions/').single('image'),
    InstructionUploadHandler
  );

  // Profile pictures
  app.post(
    '/images/uploads/profiles/',
    setupMulter('public/images/uploads/profiles/').single('image'),
    ProfileUploadHandler
  );

  // Health probe – required by RegressionChecklist_M6
  if (typeof app.get === 'function') {
    app.get('/api/uploads/health', (_req, res) =>
      res.json({ status: 'ok', service: 'uploads' })
    );
  }
}

module.exports = {
  setupImageRoutes
}; 