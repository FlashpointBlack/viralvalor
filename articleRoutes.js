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
} = require('./articleOperations');

const { handleErrorResponse } = require('./utils');
const { db } = require('./db');
const { sendSystemDirectMessage } = require('./messageOperations');
const { setupMulter } = require('./routesfunctions');
const path = require('path');
const fs = require('fs');
const express = require('express');

/** Duplicate quick helpers (kept local for module independence) */
async function isUserAdminBySub(userSub) {
  if (!userSub) return false;
  return new Promise((resolve) => {
    db.query('SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [userSub], (err, rows) => {
      if (err) {
        console.error('[isUserAdminBySub] DB error', err);
        return resolve(false);
      }
      resolve(rows.length > 0 && rows[0].isadmin === 1);
    });
  });
}

async function isUserEducatorBySub(userSub) {
  if (!userSub) return false;
  return new Promise((resolve) => {
    db.query('SELECT iseducator FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [userSub], (err, rows) => {
      if (err) {
        console.error('[isUserEducatorBySub] DB error', err);
        return resolve(false);
      }
      resolve(rows.length > 0 && rows[0].iseducator === 1);
    });
  });
}

const setupArticleRoutes = (app) => {
  // Serve uploaded article files (PDFs)
  app.use('/articles/uploads', express.static(path.join(__dirname, 'public/articles/uploads')));

  const articleUpload = setupMulter('public/articles/uploads').single('file');

  /* ---------------- Educator/Admin: Manage own articles ----------------*/
  app.get('/my-articles', async (req, res) => {
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    const isEducator = await isUserEducatorBySub(requestSub);
    if (!isAdmin && !isEducator) return res.status(403).json({ error: 'Forbidden' });

    try {
      const rows = isAdmin ? await getAllArticles() : await getArticlesForUser(requestSub);
      res.json(rows);
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching articles');
    }
  });

  // Create article – link URL
  app.post('/create-article-link', async (req, res) => {
    const { title, url, description = '' } = req.body;
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

    if (!title || !url) return res.status(400).json({ error: 'Missing required fields' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    const isEducator = await isUserEducatorBySub(requestSub);
    if (!isAdmin && !isEducator) return res.status(403).json({ error: 'Forbidden' });

    try {
      const autoApprove = !!isAdmin; // admins auto approve their own
      const articleId = await createArticleLink(title, url, requestSub, description, autoApprove);
      res.json({ articleId });
    } catch (err) {
      handleErrorResponse(err, res, 'Error creating article');
    }
  });

  // Create article – file upload (PDF)
  app.post('/upload-article-file', articleUpload, async (req, res) => {
    const { title, description = '' } = req.body;
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    const isEducator = await isUserEducatorBySub(requestSub);
    if (!isAdmin && !isEducator) return res.status(403).json({ error: 'Forbidden' });

    try {
      const { filename, originalname } = req.file;
      const autoApprove = !!isAdmin;
      const articleId = await createArticleFile(title, filename, originalname, requestSub, description, autoApprove);
      res.json({ articleId });
    } catch (err) {
      handleErrorResponse(err, res, 'Error uploading article');
    }
  });

  // Update title/description/link (owner or admin)
  app.post('/update-article', async (req, res) => {
    const { id, title, description, url } = req.body;
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

    if (!id) return res.status(400).json({ error: 'id required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const rows = await new Promise((resolve, reject) => {
        db.query('SELECT createdBy FROM articles WHERE id = ? LIMIT 1', [id], (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
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
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

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
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

    if (!articleId) return res.status(400).json({ error: 'articleId required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);

    // If not admin, verify ownership (allow self-approval)
    if (!isAdmin) {
      const rowsOwn = await new Promise((resolve,reject)=>{
        db.query('SELECT createdBy FROM articles WHERE id = ? LIMIT 1',[articleId],(err,rows)=>{if(err) return reject(err);resolve(rows);});
      });
      if (!rowsOwn.length || rowsOwn[0].createdBy !== requestSub) {
        return res.status(403).json({ error: 'Only administrators or the creator can approve this article' });
      }
    }

    try {
      await approveArticle(articleId, requestSub);

      // notify creator
      try {
        const rows = await new Promise((resolve, reject) => {
          db.query('SELECT createdBy, title FROM articles WHERE id = ? LIMIT 1', [articleId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        });
        if (rows.length) {
          const { createdBy, title } = rows[0];
          if (createdBy) {
            const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
            const link = `${baseUrl}/?tab=myarticles`;
            const body = `Your article "${title}" has been approved and is now available to all students. View the list <a href=\"${link}\">here</a>.`;
            const io = req.app.get('io');
            await sendSystemDirectMessage(createdBy, body, io);
          }
        }
      } catch (notifyErr) { console.error('Article approve notify failed', notifyErr); }

      res.json({ message: 'Article approved' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error approving article');
    }
  });

  // Deny article (admins)
  app.post('/deny-article', async (req, res) => {
    const { articleId } = req.body;
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

    if (!articleId) return res.status(400).json({ error: 'articleId required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);

    if (!isAdmin) {
      const rowsOwn = await new Promise((resolve,reject)=>{
        db.query('SELECT createdBy FROM articles WHERE id = ? LIMIT 1',[articleId],(err,rows)=>{if(err) return reject(err);resolve(rows);});
      });
      if (!rowsOwn.length || rowsOwn[0].createdBy !== requestSub) {
        return res.status(403).json({ error: 'Only administrators or the creator can deny this article' });
      }
    }

    try {
      const { createdBy, title } = await denyArticle(articleId, requestSub);
      if (createdBy) {
        const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const editLink = `${baseUrl}/?tab=articles&article=${articleId}`;
        const body = `Your article "${title}" was denied by an administrator and returned to draft. Edit it <a href=\"${editLink}\">here</a>.`;
        const io = req.app.get('io');
        await sendSystemDirectMessage(createdBy, body, io).catch(() => {});
      }
      res.json({ message: 'Article denied' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error denying article');
    }
  });

  // Delete article (admins only)
  app.post('/delete-article', async (req, res) => {
    const { articleId } = req.body;
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

    if (!articleId) return res.status(400).json({ error: 'articleId required' });
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = await isUserAdminBySub(requestSub);
    if (!isAdmin) return res.status(403).json({ error: 'Only administrators can delete articles' });

    try {
      const { fileNameServer } = await deleteArticle(articleId);

      // Remove associated file if present
      if (fileNameServer) {
        const filePath = path.join(__dirname, 'public/articles/uploads', fileNameServer);
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.error('[delete-article] Failed to delete file', err);
          }
        });
      }

      res.json({ message: 'Article deleted' });
    } catch (err) {
      handleErrorResponse(err, res, 'Error deleting article');
    }
  });

  /* ---------------- Student: Access approved articles ----------------*/
  app.get('/approved-articles', async (req, res) => {
    try {
      const rows = await getApprovedArticles();
      res.json(rows);
    } catch (err) {
      handleErrorResponse(err, res, 'Error fetching articles');
    }
  });

  /* ---------------- Download article PDF ----------------*/
  app.get('/download-article-file/:id', async (req, res) => {
    const articleId = req.params.id;
    try {
      const rows = await new Promise((resolve, reject) => {
        db.query('SELECT title, fileNameServer, originalName FROM articles WHERE id = ? LIMIT 1', [articleId], (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
      if (!rows.length) return res.status(404).send('Article not found');
      const { title, fileNameServer, originalName } = rows[0];
      if (!fileNameServer) return res.status(400).send('No uploaded file');

      const filePath = path.join(__dirname, 'public/articles/uploads', fileNameServer);
      if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

      const ext = path.extname(originalName || '') || path.extname(fileNameServer) || '.pdf';
      let safeTitle = (title || 'article').toString().replace(/[^a-z0-9\-_]/gi, '_');
      if (!safeTitle) safeTitle = 'article';

      const downloadName = `${safeTitle}${ext}`;
      return res.download(filePath, downloadName);
    } catch (err) {
      handleErrorResponse(err, res, 'Error downloading file');
    }
  });
};

module.exports = setupArticleRoutes; 