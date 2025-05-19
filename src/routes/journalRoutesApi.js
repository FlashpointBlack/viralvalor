const express = require('express');
const router = express.Router();
const {
  createJournalPrompt,
  updateJournalPrompt,
  deleteJournalPrompt,
  getAllJournalPrompts,
  getJournalPrompt,
  upsertJournalResponse,
  getPromptStats,
  getPromptsForStudent,
  getJournalResponse,
  releasePromptToAllStudents,
  getPromptRecipients,
} = require('../../journalOperations');

const { handleErrorResponse } = require('../../utils');
const { dbPromise } = require('../../db');
const { sendSystemDirectMessage } = require('../../messageOperations');
const { isUserAdminBySub } = require('../../utils/auth');

// ===== Legacy Alias Middleware =====
// Provides backward-compatibility for the former "/journal-prompts" URL scheme
// used by the React front-end.  It rewrites incoming request paths to the new
// canonical endpoints under "/prompts" before they hit the actual handlers.
router.use((req, _res, next) => {
  if (req.path.startsWith('/my-journal-prompts')) {
    req.url = req.url.replace('/my-journal-prompts', '/my-prompts');
  } else if (req.path.startsWith('/journal-prompts')) {
    req.url = req.url.replace('/journal-prompts', '/prompts');
  } else if (req.path.startsWith('/journal/prompts')) {
    req.url = req.url.replace('/journal/prompts', '/prompts');
  }
  next();
});
// ===== End Legacy Alias Middleware =====

// Placeholder for routes to be migrated
// Example:
// router.get('/prompts', async (req, res) => { ... });

// --- Admin: Manage Prompts (GET) ---
router.get('/prompts', async (req, res) => {
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdmin = await isUserAdminBySub(requestSub);
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    const rows = await getAllJournalPrompts();
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching journal prompts');
  }
});

router.get('/prompts/:id/stats', async (req, res) => {
  const promptId = req.params.id;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdmin = await isUserAdminBySub(requestSub);
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    const stats = await getPromptStats(promptId);
    res.json(stats);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching prompt stats');
  }
});

router.get('/prompts/:id/recipients', async (req, res) => {
  const promptId = req.params.id;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdmin = await isUserAdminBySub(requestSub);
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    const recipients = await getPromptRecipients(promptId);
    res.json(recipients);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching recipients');
  }
});

// --- Student/Admin: Access Prompts (GET) ---
router.get('/prompts/:id', async (req, res) => {
  const promptId = req.params.id;
  // Note: Original route did not have auth check for GETting a single prompt by ID.
  // This implies it's accessible by students if they have the ID.
  // We maintain this behavior.
  try {
    const prompt = await getJournalPrompt(promptId);
    res.json(prompt);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching prompt');
  }
});

// --- Student: Access & Respond (GET) ---
router.get('/my-prompts', async (req, res) => {
  const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const prompts = await getPromptsForStudent(userSub);
    res.json(prompts);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching prompts for student');
  }
});

router.get('/prompts/:id/my-response', async (req, res) => {
  const promptId = req.params.id;
  const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const resp = await getJournalResponse(promptId, userSub);
    res.json(resp || {});
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching student response');
  }
});

// --- Admin: Manage Prompts (POST) ---
router.post('/prompts', async (req, res) => {
  const { title, promptText } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  if (!title || !promptText) return res.status(400).json({ error: 'Missing title or promptText' });

  const isAdmin = await isUserAdminBySub(requestSub);
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    const id = await createJournalPrompt(title, promptText, requestSub);
    res.json({ id });
  } catch (err) {
    handleErrorResponse(err, res, 'Error creating prompt');
  }
});

router.post('/prompts/release', async (req, res) => { // Path changed from /release-journal-prompt
  const { promptId } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!promptId) return res.status(400).json({ error: 'promptId required' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdmin = await isUserAdminBySub(requestSub);
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    const count = await releasePromptToAllStudents(promptId);

    // ---- Send system notification to all students ----
    try {
      const prompt = await getJournalPrompt(promptId);
      const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const journalLink = `${baseUrl}/?tab=journals&prompt=${promptId}`;
      const body = `A new reflection journal prompt "${prompt.title}" is now available. You can respond to it <a href=\"${journalLink}\">here</a>.`;
      const [rows] = await dbPromise.query('SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)');

      if (rows && rows.length) {
        const io = req.app.get('io'); // req.app.get('io') might need to be passed if router is separate
        await Promise.all(rows.map(r => sendSystemDirectMessage(r.auth0_sub, body, io).catch(() => {})));
      }
    } catch (notifyErr) {
      console.error('Failed to send journal prompt notifications:', notifyErr);
    }

    res.json({ releasedCount: count });
  } catch (err) {
    handleErrorResponse(err, res, 'Error releasing prompt');
  }
});

// --- Student: Access & Respond (POST) ---
router.post('/prompts/:id/response', async (req, res) => {
  const promptId = req.params.id;
  const { responseText = '' } = req.body;
  const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const charCount = await upsertJournalResponse(promptId, userSub, responseText);
    res.json({ charCount });
  } catch (err) {
    handleErrorResponse(err, res, 'Error saving response');
  }
});

// --- Admin: Manage Prompts (PUT) ---
router.put('/prompts/:id', async (req, res) => {
  const promptId = req.params.id;
  const { title, promptText } = req.body;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdmin = await isUserAdminBySub(requestSub);
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    await updateJournalPrompt(promptId, { title, promptText });
    res.json({ message: 'Prompt updated' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error updating prompt');
  }
});

// --- Admin: Manage Prompts (DELETE) ---
router.delete('/prompts/:id', async (req, res) => {
  const promptId = req.params.id;
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdmin = await isUserAdminBySub(requestSub);
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    await deleteJournalPrompt(promptId);
    res.json({ message: 'Prompt deleted' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error deleting prompt');
  }
});

// ===== Legacy Aliases =====
/*
// Map GET /my-journal-prompts  -> GET /my-prompts
router.get('/my-journal-prompts', (req, res, next) => {
  // Rewrite the URL then pass to the next matching route (i.e. /my-prompts)
  req.url = req.url.replace('/my-journal-prompts', '/my-prompts');
  next();
});

// Map any /journal-prompts/* to /prompts/* (supports GET/POST/etc.)
router.use('/journal-prompts', (req, res, next) => {
  // Derive whatever remains after the legacy prefix
  const remaining = req.url.substring('/journal-prompts'.length);
  req.url = '/prompts' + (remaining || '') + (req.url.includes('?') ? '' : '');
  // Ensure method semantics (POST stays POST, etc.) are preserved
  next();
});
*/
// ===== End Legacy Aliases =====

module.exports = router; 