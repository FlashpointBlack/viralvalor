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

const { dbPromise } = require('./db');

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
async function _insertArticle({ title, description = '', linkUrl = null, fileNameServer = null, originalName = null, createdBy, autoApprove = false }) {
  if (!title || !createdBy) throw new Error('Missing required params');
  if (!linkUrl && !fileNameServer) throw new Error('Either linkUrl or fileNameServer required');

  const approvalStatus = autoApprove ? 'APPROVED' : 'DRAFT';
  const approvedByVal = autoApprove ? createdBy : null;

  const sql = `INSERT INTO articles (title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedBy, approvedAt, createdBy)
               VALUES (?,?,?,?,?,?,?,${autoApprove ? 'NOW()' : 'NULL'},?)`;
  const params = [title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedByVal, createdBy];

  const [results] = await dbPromise.query(sql, params);
  return results.insertId;
}

/* ---------------- Public API ---------------- */
function createArticleLink(title, url, userSub, description = '', autoApprove = false) {
  return _insertArticle({ title, description, linkUrl: url, fileNameServer: null, originalName: null, createdBy: userSub, autoApprove });
}

function createArticleFile(title, fileNameServer, originalName, userSub, description = '', autoApprove = false) {
  return _insertArticle({ title, description, linkUrl: null, fileNameServer, originalName, createdBy: userSub, autoApprove });
}

async function getArticlesForUser(userSub) {
  const sql = `SELECT * FROM articles WHERE createdBy = ? ORDER BY id DESC`;
  const [rows] = await dbPromise.query(sql, [userSub]);
  return rows;
}

async function getAllArticles() {
  const [rows] = await dbPromise.query('SELECT * FROM articles ORDER BY id DESC');
  return rows;
}

async function getApprovedArticles() {
  const [rows] = await dbPromise.query("SELECT * FROM articles WHERE approvalStatus = 'APPROVED' ORDER BY approvedAt DESC");
  return rows;
}

async function updateArticle(id, fields) {
  if (!id) throw new Error('id required');
  const allowed = ['title', 'description', 'linkUrl'];
  const setClauses = [];
  const params = [];

  allowed.forEach((f) => {
    if (fields.hasOwnProperty(f)) {
      setClauses.push(`${f} = ?`);
      params.push(fields[f]);
    }
  });

  if (setClauses.length === 0) throw new Error('No fields to update');

  const sql = `UPDATE articles SET ${setClauses.join(', ')}, updatedAt = NOW() WHERE id = ?`;
  params.push(id);

  await dbPromise.query(sql, params);
}

async function submitArticleForApproval(articleId, userSub) {
  if (!articleId || !userSub) throw new Error('articleId and userSub required');

  const selectSql = 'SELECT approvalStatus, createdBy FROM articles WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(selectSql, [articleId]);
  if (!rows.length) throw new Error('Article not found');
  const row = rows[0];
  if (row.createdBy !== userSub) throw new Error('Not owner');
  if (row.approvalStatus && row.approvalStatus !== 'DRAFT') {
    throw new Error('Cannot submit in current state');
  }

  await dbPromise.query("UPDATE articles SET approvalStatus = 'PENDING', approvedBy = NULL, approvedAt = NULL WHERE id = ?", [articleId]);
}

async function approveArticle(articleId, adminSub) {
  if (!articleId || !adminSub) throw new Error('articleId and adminSub required');

  const selectSql = 'SELECT approvalStatus FROM articles WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(selectSql, [articleId]);
  if (!rows.length) throw new Error('Article not found');
  const status = rows[0].approvalStatus;
  if (status === 'APPROVED') return; // already approved

  await dbPromise.query("UPDATE articles SET approvalStatus = 'APPROVED', approvedBy = ?, approvedAt = NOW() WHERE id = ?", [adminSub, articleId]);
}

async function denyArticle(articleId, adminSub) {
  if (!articleId || !adminSub) throw new Error('articleId and adminSub required');

  const selectSql = 'SELECT approvalStatus, createdBy, title FROM articles WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(selectSql, [articleId]);
  if (!rows.length) throw new Error('Article not found');

  const { approvalStatus: status, createdBy, title } = rows[0];
  if (status === 'DRAFT') return { createdBy, title };

  await dbPromise.query("UPDATE articles SET approvalStatus = 'DRAFT', approvedBy = NULL, approvedAt = NULL WHERE id = ?", [articleId]);
  return { createdBy, title };
}

// NEW: Permanently delete an article (admin only)
async function deleteArticle(articleId) {
  if (!articleId) throw new Error('articleId required');

  const selectSql = 'SELECT fileNameServer FROM articles WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(selectSql, [articleId]);
  if (!rows.length) throw new Error('Article not found');

  const { fileNameServer } = rows[0] || {};

  await dbPromise.query('DELETE FROM articles WHERE id = ?', [articleId]);
  return { fileNameServer };
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