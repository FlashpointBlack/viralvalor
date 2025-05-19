const express = require('express');

// Import the historical `setupRoutes(app)` helper from the root of the
// repository.  The function will attach every route exactly as before so
// we can transition feature groups incrementally without downtime.
const { setupRoutes } = require('../../routes');

const router = express.Router();

// Apply the legacy endpoints onto this router instance.
setupRoutes(router);

// Simple health probe so we can confirm the legacy bundle is still wired.
router.get('/legacy-health', (req, res) => res.json({ status: 'ok' }));

module.exports = router; 