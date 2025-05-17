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
} = require('./journalOperations');

const { handleErrorResponse } = require('./utils');
const { dbPromise } = require('./db');
const { sendSystemDirectMessage } = require('./messageOperations');

/**
 * Quick helper – duplicated from routes.js so this file can stand alone.
 */
async function isUserAdminBySub(userSub) {
  if (!userSub) return false;
  return new Promise((resolve) => {
    (async () => {
      try {
        const [rows] = await dbPromise.query('SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [userSub]);
        resolve(rows.length > 0 && rows[0].isadmin === 1);
      } catch (err) {
        console.error('isUserAdminBySub DB error', err);
        resolve(false);
      }
    })();
  });
}

const setupJournalRoutes = (app) => {
  // ---------------- Admin: Manage prompts -----------------
  app.get('/journal-prompts', async (req, res) => {
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

  app.post('/journal-prompts', async (req, res) => {
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

  app.put('/journal-prompts/:id', async (req, res) => {
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

  app.delete('/journal-prompts/:id', async (req, res) => {
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

  // Stats popup: returns charCount list (no contents)
  app.get('/journal-prompts/:id/stats', async (req, res) => {
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

  // Release prompt to all students
  app.post('/release-journal-prompt', async (req, res) => {
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
        // Fetch the prompt title for message body
        const prompt = await getJournalPrompt(promptId);

        // Build a link to the journals tab in the SPA
        const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const journalLink = `${baseUrl}/?tab=journals&prompt=${promptId}`;

        const body = `A new reflection journal prompt "${prompt.title}" is now available. You can respond to it <a href=\"${journalLink}\">here</a>.`;

        // Get list of all student recipients (non-educator accounts)
        const [rows] = await dbPromise.query('SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)');

        if (rows && rows.length) {
          const io = req.app.get('io');
          // Fire messages concurrently but do not await each individually to avoid long response
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

  // Recipients list
  app.get('/journal-prompts/:id/recipients', async (req, res) => {
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

  // ---------------- Student: access & respond -----------------
  app.get('/my-journal-prompts', async (req, res) => {
    const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
    if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const prompts = await getPromptsForStudent(userSub);
      res.json(prompts);
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching prompts');
    }
  });

  app.get('/journal-prompts/:id', async (req, res) => {
    const promptId = req.params.id;
    try {
      const prompt = await getJournalPrompt(promptId);
      res.json(prompt);
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching prompt');
    }
  });

  app.post('/journal-prompts/:id/response', async (req, res) => {
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

  // Fetch current student's response (including text) for editing
  app.get('/journal-prompts/:id/my-response', async (req, res) => {
    const promptId = req.params.id;
    const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
    if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const resp = await getJournalResponse(promptId, userSub);
      res.json(resp || {});
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching response');
    }
  });
};

module.exports = { setupJournalRoutes }; 