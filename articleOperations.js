/*
 * articleOperations.js
 * ---------------------------------------------------------
 * Helper functions for educator-submitted journal articles.
 * The workflow mirrors lectureOperations but without the release
 * step – once approved, every student can access the article.
 *
 * Expected MySQL table schema (create separately):
 *   CREATE TABLE IF NOT EXISTS articles (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     title VARCHAR(255) NOT NULL,
 *     description TEXT NULL,
 *     linkUrl VARCHAR(1024) NULL,
 *     fileNameServer VARCHAR(512) NULL,
 *     originalName VARCHAR(512) NULL,
 *     approvalStatus ENUM('DRAFT','PENDING','APPROVED') DEFAULT 'DRAFT',
 *     approvedBy VARCHAR(128) NULL,
 *     approvedAt DATETIME NULL,
 *     createdBy VARCHAR(128) NOT NULL,
 *     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *     updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 *   );
 *
 * Only one of linkUrl or fileNameServer is required (the other may be null).
 * -------------------------------------------------------------------------
 */

const { db } = require('./db');

/* ---------------- Internal helpers ---------------- */
/**
 * Insert a new article row.
 * @param {Object} params
 * @param {string} params.title
 * @param {string} params.description
 * @param {string|null} params.linkUrl
 * @param {string|null} params.fileNameServer
 * @param {string|null} params.originalName
 * @param {string} params.createdBy  – auth0_sub of submitter
 * @param {boolean} params.autoApprove – if true, immediately mark as APPROVED
 */
function _insertArticle({ title, description = '', linkUrl = null, fileNameServer = null, originalName = null, createdBy, autoApprove = false }) {
  return new Promise((resolve, reject) => {
    if (!title || !createdBy) return reject(new Error('Missing required params'));
    if (!linkUrl && !fileNameServer) return reject(new Error('Either linkUrl or fileNameServer required'));

    const approvalStatus = autoApprove ? 'APPROVED' : 'DRAFT';
    const approvedByVal = autoApprove ? createdBy : null;

    const sql = `INSERT INTO articles (title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedBy, approvedAt, createdBy)
                 VALUES (?,?,?,?,?,?,?,${autoApprove ? 'NOW()' : 'NULL'},?)`;
    const params = [title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedByVal, createdBy];

    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results.insertId);
    });
  });
}

/* ---------------- Public API ---------------- */
function createArticleLink(title, url, userSub, description = '', autoApprove = false) {
  return _insertArticle({ title, description, linkUrl: url, fileNameServer: null, originalName: null, createdBy: userSub, autoApprove });
}

function createArticleFile(title, fileNameServer, originalName, userSub, description = '', autoApprove = false) {
  return _insertArticle({ title, description, linkUrl: null, fileNameServer, originalName, createdBy: userSub, autoApprove });
}

function getArticlesForUser(userSub) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM articles WHERE createdBy = ? ORDER BY id DESC`;
    db.query(sql, [userSub], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getAllArticles() {
  return new Promise((resolve, reject) => {
    db.query('SELECT * FROM articles ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getApprovedArticles() {
  return new Promise((resolve, reject) => {
    db.query("SELECT * FROM articles WHERE approvalStatus = 'APPROVED' ORDER BY approvedAt DESC", (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function updateArticle(id, fields) {
  return new Promise((resolve, reject) => {
    if (!id) return reject(new Error('id required'));
    const allowed = ['title', 'description', 'linkUrl'];
    const setClauses = [];
    const params = [];
    allowed.forEach((f) => {
      if (fields.hasOwnProperty(f)) {
        setClauses.push(`${f} = ?`);
        params.push(fields[f]);
      }
    });
    if (setClauses.length === 0) return reject(new Error('No fields to update'));

    const sql = `UPDATE articles SET ${setClauses.join(', ')}, updatedAt = NOW() WHERE id = ?`;
    params.push(id);

    db.query(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function submitArticleForApproval(articleId, userSub) {
  return new Promise((resolve, reject) => {
    if (!articleId || !userSub) return reject(new Error('articleId and userSub required'));

    const selectSql = 'SELECT approvalStatus, createdBy FROM articles WHERE id = ? LIMIT 1';
    db.query(selectSql, [articleId], (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Article not found'));
      const row = rows[0];
      if (row.createdBy !== userSub) return reject(new Error('Not owner'));
      if (row.approvalStatus && row.approvalStatus !== 'DRAFT') {
        return reject(new Error('Cannot submit in current state'));
      }
      db.query("UPDATE articles SET approvalStatus = 'PENDING', approvedBy = NULL, approvedAt = NULL WHERE id = ?", [articleId], (updErr) => {
        if (updErr) return reject(updErr);
        resolve();
      });
    });
  });
}

function approveArticle(articleId, adminSub) {
  return new Promise((resolve, reject) => {
    if (!articleId || !adminSub) return reject(new Error('articleId and adminSub required'));

    const selectSql = 'SELECT approvalStatus FROM articles WHERE id = ? LIMIT 1';
    db.query(selectSql, [articleId], (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Article not found'));
      const status = rows[0].approvalStatus;
      if (status === 'APPROVED') return resolve(); // already approved

      db.query("UPDATE articles SET approvalStatus = 'APPROVED', approvedBy = ?, approvedAt = NOW() WHERE id = ?", [adminSub, articleId], (updErr) => {
        if (updErr) return reject(updErr);
        resolve();
      });
    });
  });
}

function denyArticle(articleId, adminSub) {
  return new Promise((resolve, reject) => {
    if (!articleId || !adminSub) return reject(new Error('articleId and adminSub required'));

    const selectSql = 'SELECT approvalStatus, createdBy, title FROM articles WHERE id = ? LIMIT 1';
    db.query(selectSql, [articleId], (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Article not found'));

      const { approvalStatus: status, createdBy, title } = rows[0];
      if (status === 'DRAFT') return resolve({ createdBy, title });

      db.query("UPDATE articles SET approvalStatus = 'DRAFT', approvedBy = NULL, approvedAt = NULL WHERE id = ?", [articleId], (updErr) => {
        if (updErr) return reject(updErr);
        resolve({ createdBy, title });
      });
    });
  });
}

// NEW: Permanently delete an article (admin only)
function deleteArticle(articleId) {
  return new Promise((resolve, reject) => {
    if (!articleId) return reject(new Error('articleId required'));

    // First fetch any file info so we can clean up after deletion
    const selectSql = 'SELECT fileNameServer FROM articles WHERE id = ? LIMIT 1';
    db.query(selectSql, [articleId], (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Article not found'));

      const { fileNameServer } = rows[0] || {};

      // Delete the DB row
      db.query('DELETE FROM articles WHERE id = ?', [articleId], (delErr) => {
        if (delErr) return reject(delErr);
        resolve({ fileNameServer });
      });
    });
  });
}

module.exports = {
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
}; 