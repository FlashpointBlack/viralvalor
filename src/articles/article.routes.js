const {
  createArticleLink,
  createArticleFile,
  getArticlesForUser,
  getAllArticles,
  getApprovedArticles,
  updateArticle,
  submitArticleForApproval,
  approveArticle,
  denyArticle,
  deleteArticle,
} = require('../../articleOperations');

const { handleErrorResponse } = require('../../utils');
const { dbPromise } = require('../../db');
const { sendSystemDirectMessage } = require('../../messageOperations');
const { setupMulter } = require('../../routesfunctions');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { isUserAdminBySub, isUserEducatorBySub } = require('../../utils/auth');

/**
 * Attach all article-related endpoints to the Express `app`.
 * Retains the previous public API surface – no URL changes.
 * @param {import('express').Express} app
 */
const setupArticleRoutes = (app) => {
  // Create a dedicated sub-router so every endpoint gets the "/articles" prefix
  const router = express.Router();

  // ------------------------------------------------------------
  // Static assets (PDF uploads) – keep these on the parent app so
  // the public URL remains /articles/uploads/<file>
  // ------------------------------------------------------------

  app.use(
    '/articles/uploads',
    express.static(path.resolve(process.cwd(), 'public/articles/uploads'))
  );

  const articleUpload = setupMulter('public/articles/uploads').single('file');

  /* ---------------- Educator/Admin: Manage own articles ----------------*/
  router.get('/my-articles', async (req, res) => {
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    const isEducator = await isUserEducatorBySub(requestSub);
    if (!isAdmin && !isEducator)
      return res.status(403).json({ error: 'Forbidden' });

    try {
      const rows = isAdmin
        ? await getAllArticles()
        : await getArticlesForUser(requestSub);
      res.json(rows);
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching articles');
    }
  });

  // Create article – link URL
  router.post('/create-article-link', async (req, res) => {
    const { title, url, description = '' } = req.body;
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];

    if (!title || !url)
      return res.status(400).json({ error: 'Missing required fields' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    const isEducator = await isUserEducatorBySub(requestSub);
    if (!isAdmin && !isEducator)
      return res.status(403).json({ error: 'Forbidden' });

    try {
      const autoApprove = !!isAdmin; // admins auto approve their own
      const articleId = await createArticleLink(
        title,
        url,
        requestSub,
        description,
        autoApprove
      );
      res.json({ articleId });
    } catch (err) {
      handleErrorResponse(err, res, 'Error creating article');
    }
  });

  // Create article – file upload (PDF)
  router.post('/upload-article-file', articleUpload, async (req, res) => {
    const { title, description = '' } = req.body;
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];

    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    const isEducator = await isUserEducatorBySub(requestSub);
    if (!isAdmin && !isEducator)
      return res.status(403).json({ error: 'Forbidden' });

    try {
      const { filename, originalname } = req.file;
      const autoApprove = !!isAdmin;
      const articleId = await createArticleFile(
        title,
        filename,
        originalname,
        requestSub,
        description,
        autoApprove
      );
      res.json({ articleId });
    } catch (err) {
      handleErrorResponse(err, res, 'Error uploading article');
    }
  });

  // Update title/description/link (owner or admin)
  router.post('/update-article', async (req, res) => {
    const { id, title, description, url } = req.body;
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];

    if (!id) return res.status(400).json({ error: 'id required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const [rows] = await dbPromise.query('SELECT createdBy FROM articles WHERE id = ? LIMIT 1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Article not found' });

      const isOwner = rows[0].createdBy === requestSub;
      const isAdmin = await isUserAdminBySub(requestSub);
      if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

      const fields = {};
      if (title !== undefined) fields.title = title;
      if (description !== undefined) fields.description = description;
      if (url !== undefined) fields.linkUrl = url;

      await updateArticle(id, fields);
      res.json({ message: 'Article updated' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error updating article');
    }
  });

  // Submit for approval (educator)
  router.post('/submit-article-for-approval', async (req, res) => {
    const { articleId } = req.body;
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];

    if (!articleId) return res.status(400).json({ error: 'articleId required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    try {
      await submitArticleForApproval(articleId, requestSub);
      res.json({ message: 'Article submitted for approval' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error submitting article');
    }
  });

  // Approve article (admins – may also approve their own drafts)
  router.post('/approve-article', async (req, res) => {
    const { articleId } = req.body;
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];

    if (!articleId) return res.status(400).json({ error: 'articleId required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);

    // If not admin, verify ownership (allow self-approval)
    if (!isAdmin) {
      const [rowsOwn] = await dbPromise.query('SELECT createdBy FROM articles WHERE id = ? LIMIT 1', [articleId]);
      if (!rowsOwn.length || rowsOwn[0].createdBy !== requestSub) {
        return res.status(403).json({
          error: 'Only administrators or the creator can approve this article',
        });
      }
    }

    try {
      await approveArticle(articleId, requestSub);

      // notify creator
      try {
        const [rows] = await dbPromise.query('SELECT createdBy, title FROM articles WHERE id = ? LIMIT 1', [articleId]);
        if (rows.length) {
          const { createdBy, title } = rows[0];
          if (createdBy) {
            const baseUrl =
              process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
            const link = `${baseUrl}/?tab=myarticles`;
            await sendSystemDirectMessage(createdBy, `Your article "${title}" has been approved and is now available to students. ${link}`);
          }
        }
      } catch (dmErr) {
        console.error('Failed to send system DM', dmErr);
      }

      res.json({ message: 'Article approved' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error approving article');
    }
  });

  // Deny (admin only)
  router.post('/deny-article', async (req, res) => {
    const { articleId } = req.body;
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];

    if (!articleId) return res.status(400).json({ error: 'articleId required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    try {
      await denyArticle(articleId, requestSub);
      res.json({ message: 'Article denied' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error denying article');
    }
  });

  // Delete (owner or admin)
  router.post('/delete-article', async (req, res) => {
    const { articleId } = req.body;
    const requestSub =
      (req.oidc && req.oidc.user && req.oidc.user.sub) ||
      req.headers['x-user-sub'];

    if (!articleId) return res.status(400).json({ error: 'articleId required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const [rows] = await dbPromise.query('SELECT createdBy, fileServerName FROM articles WHERE id = ? LIMIT 1', [articleId]);
      if (!rows.length) return res.status(404).json({ error: 'Article not found' });

      const { createdBy, fileServerName } = rows[0];
      const isOwner = createdBy === requestSub;
      const isAdmin = await isUserAdminBySub(requestSub);
      if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

      // Remove physical file if it was a file-based article
      if (fileServerName) {
        try {
          fs.unlinkSync(
            path.resolve(process.cwd(), 'public/articles/uploads', fileServerName)
          );
        } catch (fsErr) {
          console.error('Failed to delete article file', fsErr);
        }
      }

      await deleteArticle(articleId);
      res.json({ message: 'Article deleted' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error deleting article');
    }
  });

  /* ---------------- Student-facing ----------------*/
  router.get('/get-approved-articles', async (req, res) => {
    try {
      const rows = await getApprovedArticles();
      res.json(rows);
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching articles');
    }
  });

  // Mount the router at '/articles'
  app.use('/articles', router);
};

module.exports = setupArticleRoutes; 