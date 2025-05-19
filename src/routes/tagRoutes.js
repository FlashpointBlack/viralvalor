const express = require('express');
const router = express.Router();

// Data operations for Tag model
const { createTag, getAllTags } = require('../../tagOperations');
// Role helpers centralised under utils/auth
const { isUserAdminBySub, isUserEducatorBySub } = require('../../utils/auth');
// Shared utilities for validation / error formatting
const {
  handleErrorResponse,
} = require('../../utils');

// -------------------------------------------------------------------------
//  READ-ONLY – list tags
// -------------------------------------------------------------------------
// [GET] /tags  → returns array of { id, name }
router.get('/tags', async (_req, res) => {
  try {
    const rows = await getAllTags();
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching tags.');
  }
});

// NEW alias: allow axios baseURL="/api" clients to hit simply "/api/tags"
router.get('/', async (_req, res) => {
  try {
    const rows = await getAllTags();
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching tags.');
  }
});

// -------------------------------------------------------------------------
//  CREATE – educators & admins only
// -------------------------------------------------------------------------
// [POST] /create-tag { name }
router.post('/create-tag', async (req, res) => {
  const { name } = req.body;

  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isEducatorFlag = await isUserEducatorBySub(requestSub);
  if (!isAdminFlag && !isEducatorFlag) {
    return res.status(403).json({ error: 'Only educators or administrators can create tags' });
  }

  try {
    const tagId = await createTag(name, requestSub);
    res.status(200).json({ tagId });
  } catch (err) {
    handleErrorResponse(err, res, 'Error creating tag.');
  }
});

// -------------------------------------------------------------------------
//  Health-probe – for admin self-test page
// -------------------------------------------------------------------------
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'tags' }));

module.exports = router; 