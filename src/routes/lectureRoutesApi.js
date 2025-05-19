const express = require('express');

// Reuse the existing comprehensive lecture endpoint definitions
const { setupLectureRoutes } = require('../../lectureRoutes');

const router = express.Router();

// Mount the legacy handlers onto this router so they inherit the prefix
setupLectureRoutes(router);

// Simple health-check so monitoring can target the new namespace
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'lectures' }));

module.exports = router; 