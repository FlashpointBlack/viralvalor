console.log('[API_ROUTES_INDEX ENTRY] File loaded.');

const express = require('express');

// Domain-specific routers (mounted below)
const authRoutes = require('./auth');
const uploadRoutes = require('./uploads');
const encounterRoutes = require('./encounterRoutes');
const questionRoutes = require('./questionRoutes');
const badgeRoutes = require('./badgeRoutes');
const characterRoutes = require('./characterRoutes');
const backdropRoutes = require('./backdropRoutes');
const instructionRoutes = require('./instructionRoutes');
const tagRoutes = require('./tagRoutes');
const lectureRoutes = require('./lectureRoutesApi');
const userRoutes = require('./userRoutesApi');
const messageApiRoutes = require('./messageRoutesApi');
const journalApiRoutes = require('./journalRoutesApi');
// const selfTestApiRoutes = require('./selfTestRoutesApi');

// Import message routes setup
// const { setupMessageRoutes } = require('../../messageRoutes'); // Removed legacy import

// Temporary – wraps existing mega routes while we migrate feature groups
// const legacyRoutes = require('./legacyRoutes'); // Remove this line

const router = express.Router();

// ===== BEGIN ADDED LOGGING =====
router.use((req, res, next) => {
  console.log(`[API_ROUTES_HANDLER]: Received request on apiRouter: ${req.method} ${req.url} (original: ${req.originalUrl})`);
  next();
});
// ===== END ADDED LOGGING =====

// ---------------- Health & Core ----------------
router.use('/auth', authRoutes);
router.use('/uploads', uploadRoutes);
router.use('/encounters', encounterRoutes);
router.use('/questions', questionRoutes);
router.use('/badges', badgeRoutes);
router.use('/characters', characterRoutes);
router.use('/backdrops', backdropRoutes);
router.use('/instructions', instructionRoutes);
router.use('/tags', tagRoutes);
router.use('/lectures', lectureRoutes);
router.use('/users', userRoutes);
router.use(messageApiRoutes);
router.use('/journal', journalApiRoutes);
// router.use('/selftest', selfTestApiRoutes);

// Ensure message routes are available under /api
// Original attempt: setupMessageRoutes(router); This mounted /conversations at apiRouter's root.
// New approach: Mount message routes under an additional /api prefix within this apiRouter
// to handle incoming req.url of '/api/conversations'.
// const messagesApiSubRouter = express.Router();
// setupMessageRoutes(messagesApiSubRouter); // messageRoutes will be at the root of messagesApiSubRouter (e.g., /conversations)
// router.use('/api', messagesApiSubRouter); // Mount this so it handles /api/conversations within apiRouter
// console.log('[API_ROUTES_INDEX]: Message routes setup on apiRouter under /api sub-path.');

// Corrected approach: Mount message routes directly on this router.
// Since this router is mounted at /api in server.js, and setupMessageRoutes
// mounts its routes (e.g., /conversations) at the root of the passed router,
// this will correctly make them available at /api/conversations.
// setupMessageRoutes(router); // Removed legacy mounting
// console.log('[API_ROUTES_INDEX]: Message routes setup directly on apiRouter.');
console.log('[API_ROUTES_INDEX]: Message API routes (messageApiRoutes) now mounted directly on apiRouter.');
console.log('[API_ROUTES_INDEX]: Journal API routes (journalApiRoutes) now mounted directly on apiRouter.');

// ------------------------------------------------
// FALLBACK: Legacy endpoints – must be mounted last so that
// any new domain-specific routes override their counterparts.
// ------------------------------------------------
// console.log('[API_ROUTES_INDEX]: Setting up legacy routes on apiRouter at / ...'); // Remove this line
// router.use('/', legacyRoutes); // This should ideally not contain /api/conversations if the above works // Remove this line
// console.log('[API_ROUTES_INDEX]: Legacy routes setup on apiRouter complete.'); // Remove this line

router.get('/lectures/health', (_req, res) => res.json({ status: 'ok', service: 'lectures' }));

module.exports = router; 