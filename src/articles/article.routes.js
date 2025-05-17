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

/**
 * Helper – check admin rights by userSub
 * Keep a local copy to avoid circular deps and preserve feature independence.
 */
async function isUserAdminBySub(userSub) {
  if (!userSub) return false;
  try {
    const [rows] = await dbPromise.query(
      'SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? LIMIT 1',
      [userSub]
    );
    return rows.length > 0 && rows[0].isadmin === 1;
  } catch (err) {
    console.error('[isUserAdminBySub] DB error', err);
    return false;
  }
}

async function isUserEducatorBySub(userSub) {
  if (!userSub) return false;
  try {
    const [rows] = await dbPromise.query(
      'SELECT iseducator FROM UserAccounts WHERE auth0_sub = ? LIMIT 1',
      [userSub]
    );
    return rows.length > 0 && rows[0].iseducator === 1;
  } catch (err) {
    console.error('[isUserEducatorBySub] DB error', err);
    return false;
  }
}

/**
 * Attach all article-related endpoints to the Express `app`.
 * Retains the previous public API surface – no URL changes.
 * @param {import('express').Express} app
 */
const setupArticleRoutes = (app) => {
  // Serve uploaded article files (PDFs)
  app.use(
    '/articles/uploads',
    express.static(path.resolve(process.cwd(), 'public/articles/uploads'))
  );

  const articleUpload = setupMulter('public/articles/uploads').single('file');

  /* ---------------- Educator/Admin: Manage own articles ----------------*/
  app.get('/my-articles', async (req, res) => {
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
  app.post('/create-article-link', async (req, res) => {
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
  app.post('/upload-article-file', articleUpload, async (req, res) => {
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
  app.post('/update-article', async (req, res) => {
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
  app.post('/submit-article-for-approval', async (req, res) => {
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
  app.post('/approve-article', async (req, res) => {
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
  app.post('/deny-article', async (req, res) => {
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
  app.post('/delete-article', async (req, res) => {
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
  app.get('/get-approved-articles', async (req, res) => {
    try {
      const rows = await getApprovedArticles();
      res.json(rows);
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching articles');
    }
  });
};

module.exports = setupArticleRoutes; 