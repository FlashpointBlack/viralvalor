// lectureOperations.js
// Helper functions for handling educator lectures (link or PowerPoint upload)
// Schema expected:
//   CREATE TABLE IF NOT EXISTS lectures (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     title VARCHAR(255) NOT NULL,
//     description TEXT NULL,
//     linkUrl VARCHAR(1024) NULL,
//     fileNameServer VARCHAR(512) NULL,
//     originalName VARCHAR(512) NULL,
//     createdBy VARCHAR(128) NOT NULL,
//     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//   );
// At least one of linkUrl or fileNameServer should be non-null.

const { db, dbPromise } = require('./db');

async function createLectureLink(title, url, userSub, description = '') {
  if (!title || !url || !userSub) throw new Error('Missing required params');
  const q = `INSERT INTO lectures (title, description, linkUrl, createdBy) VALUES (?, ?, ?, ?)`;
  const [results] = await dbPromise.query(q, [title, description, url, userSub]);
  return results.insertId;
}

async function createLectureFile(title, fileNameServer, originalName, userSub, description = '') {
  if (!title || !fileNameServer || !originalName || !userSub) throw new Error('Missing required params');
  const q = `INSERT INTO lectures (title, description, fileNameServer, originalName, createdBy) VALUES (?, ?, ?, ?, ?)`;
  const [results] = await dbPromise.query(q, [title, description, fileNameServer, originalName, userSub]);
  return results.insertId;
}

async function getLecturesForUser(userSub) {
  if (!userSub) throw new Error('userSub required');
  const q = `SELECT id, title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedBy, approvedAt, createdAt, lastReleasedAt FROM lectures WHERE createdBy = ? ORDER BY id DESC`;
  const [rows] = await dbPromise.query(q, [userSub]);
  return rows;
}

async function getAllLectures() {
  const q = `SELECT id, title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedBy, approvedAt, createdBy, createdAt, lastReleasedAt FROM lectures ORDER BY id DESC`;
  const [rows] = await dbPromise.query(q);
  return rows;
}

async function updateLecture(id, fields) {
  if (!id) throw new Error('Lecture id is required');

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

  const q = `UPDATE lectures SET ${setClauses.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`;
  params.push(id);

  await dbPromise.query(q, params);
  return;
}

async function createBlankLecture(userSub, title = 'Untitled Lecture', description = '') {
  if (!userSub) throw new Error('userSub required');
  if (!title) title = 'Untitled Lecture';
  const q = `INSERT INTO lectures (title, description, createdBy) VALUES (?, ?, ?)`;
  const [results] = await dbPromise.query(q, [title, description, userSub]);
  return results.insertId;
}

/**
 * NOTE: The below helper is added inline here to avoid creating excessive files. It provides
 * basic lecture "release" functionality by inserting rows in a pivot table called
 * `lecture_access` (schema: lectureId INT, userSub VARCHAR(128), releasedAt DATETIME, PRIMARY KEY (lectureId,userSub)).
 * Admin routes will call this helper. If the table does not yet exist the SQL to create it is:
 *   CREATE TABLE IF NOT EXISTS lecture_access (
 *     lectureId INT NOT NULL,
 *     userSub VARCHAR(128) NOT NULL,
 *     releasedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *     PRIMARY KEY (lectureId, userSub)
 *   );
 */

/**
 * Give access for a lecture to every currently-registered student user.
 * Returns count of rows inserted (ignored duplicates not counted).
 */
async function releaseLectureToAllStudents(lectureId) {
  if (!lectureId) throw new Error('lectureId is required');

  // 1. Fetch all student subs
  const studentQuery = `SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)`;
  const [rows] = await dbPromise.query(studentQuery);
  if (!rows || rows.length === 0) return 0;

  const values = rows.map(r => [lectureId, r.auth0_sub]);

  // 2. Bulk insert – IGNORE duplicates
  const insertSql = 'INSERT IGNORE INTO lecture_access (lectureId, userSub) VALUES ?';
  const [result] = await dbPromise.query(insertSql, [values]);
  const inserted = result ? result.affectedRows : 0;

  // 3. Update lecture timestamp (fire-and-forget)
  await dbPromise.query('UPDATE lectures SET lastReleasedAt = NOW() WHERE id = ?', [lectureId]);

  return inserted;
}

/**
 * Fetch all lectures that have been released to a given user via lecture_access.
 * Returns array with the core lecture fields plus the release timestamp.
 */
async function getAccessibleLecturesForUser(userSub) {
  if (!userSub) throw new Error('userSub required');
  const sql = `SELECT l.id, l.title, l.description, l.linkUrl, l.fileNameServer, l.originalName,
                      l.lastReleasedAt, la.releasedAt
               FROM lectures l
               INNER JOIN lecture_access la ON la.lectureId = l.id
               WHERE la.userSub = ?
               ORDER BY la.releasedAt DESC`;
  const [rows] = await dbPromise.query(sql, [userSub]);
  return rows;
}

async function submitLectureForApproval(lectureId, userSub) {
  if (!lectureId || !userSub) throw new Error('lectureId and userSub required');

  const selectSql = 'SELECT approvalStatus, createdBy FROM lectures WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(selectSql, [lectureId]);
  if (!rows || rows.length === 0) throw new Error('Lecture not found');

  const row = rows[0];
  if (row.createdBy !== userSub) throw new Error('You are not the owner of this lecture');
  if (row.approvalStatus && row.approvalStatus !== 'DRAFT') {
    throw new Error('Lecture cannot be submitted for approval in its current state');
  }

  const updateSql = "UPDATE lectures SET approvalStatus = 'PENDING', approvedBy = NULL, approvedAt = NULL WHERE id = ?";
  await dbPromise.query(updateSql, [lectureId]);
}

async function approveLecture(lectureId, adminSub) {
  if (!lectureId || !adminSub) throw new Error('lectureId and adminSub required');

  // Validate lecture exists + status
  const selectSql = 'SELECT approvalStatus FROM lectures WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(selectSql, [lectureId]);
  if (!rows || rows.length === 0) throw new Error('Lecture not found');

  const status = rows[0].approvalStatus;
  if (status && status !== 'PENDING' && status !== 'DRAFT') {
    throw new Error('Lecture cannot be approved in its current state');
  }

  // 1) Ensure at least one question exists
  const countQuestionsSql = 'SELECT COUNT(*) AS cnt FROM questions WHERE lectureId = ?';
  const [cntRows] = await dbPromise.query(countQuestionsSql, [lectureId]);
  const totalQuestions = cntRows && cntRows.length ? cntRows[0].cnt : 0;
  if (totalQuestions === 0) {
    throw new Error('Lecture must contain at least one question before approval');
  }

  // 2) Ensure each question has at least one tag
  const missingTagsSql = `SELECT q.id
                           FROM questions q
                           LEFT JOIN question_tags qt ON qt.questionId = q.id
                           WHERE q.lectureId = ?
                           GROUP BY q.id
                           HAVING COUNT(qt.tagId) = 0
                           LIMIT 1`;
  const [tagRows] = await dbPromise.query(missingTagsSql, [lectureId]);
  if (tagRows && tagRows.length > 0) {
    throw new Error('All questions must have at least one tag before lecture can be approved');
  }

  // Approve the lecture
  const updateSql = "UPDATE lectures SET approvalStatus = 'APPROVED', approvedBy = ?, approvedAt = NOW() WHERE id = ?";
  await dbPromise.query(updateSql, [adminSub, lectureId]);
}

async function denyLecture(lectureId, adminSub) {
  if (!lectureId || !adminSub) throw new Error('lectureId and adminSub required');

  const selectSql = 'SELECT approvalStatus, createdBy, title FROM lectures WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(selectSql, [lectureId]);
  if (!rows || rows.length === 0) throw new Error('Lecture not found');

  const { approvalStatus: status, createdBy, title } = rows[0];

  if (status !== 'DRAFT') {
    const updateSql = "UPDATE lectures SET approvalStatus = 'DRAFT', approvedBy = NULL, approvedAt = NULL WHERE id = ?";
    await dbPromise.query(updateSql, [lectureId]);
  }

  return { createdBy, title };
}

module.exports = {
  createLectureLink,
  createLectureFile,
  getLecturesForUser,
  getAllLectures,
  updateLecture,
  createBlankLecture,
  releaseLectureToAllStudents,
  getAccessibleLecturesForUser,
  submitLectureForApproval,
  approveLecture,
  denyLecture
}; 