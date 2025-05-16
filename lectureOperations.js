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

const { db } = require('./db');

function createLectureLink(title, url, userSub, description = '') {
  return new Promise((resolve, reject) => {
    if (!title || !url || !userSub) return reject(new Error('Missing required params'));
    const q = `INSERT INTO lectures (title, description, linkUrl, createdBy) VALUES (?, ?, ?, ?)`;
    db.query(q, [title, description, url, userSub], (err, results) => {
      if (err) return reject(err);
      resolve(results.insertId);
    });
  });
}

function createLectureFile(title, fileNameServer, originalName, userSub, description = '') {
  return new Promise((resolve, reject) => {
    if (!title || !fileNameServer || !originalName || !userSub) return reject(new Error('Missing required params'));
    const q = `INSERT INTO lectures (title, description, fileNameServer, originalName, createdBy) VALUES (?, ?, ?, ?, ?)`;
    db.query(q, [title, description, fileNameServer, originalName, userSub], (err, results) => {
      if (err) return reject(err);
      resolve(results.insertId);
    });
  });
}

function getLecturesForUser(userSub) {
  return new Promise((resolve, reject) => {
    if (!userSub) return reject(new Error('userSub required'));
    const q = `SELECT id, title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedBy, approvedAt, createdAt, lastReleasedAt FROM lectures WHERE createdBy = ? ORDER BY id DESC`;
    db.query(q, [userSub], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getAllLectures() {
  return new Promise((resolve, reject) => {
    const q = `SELECT id, title, description, linkUrl, fileNameServer, originalName, approvalStatus, approvedBy, approvedAt, createdBy, createdAt, lastReleasedAt FROM lectures ORDER BY id DESC`;
    db.query(q, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function updateLecture(id, fields) {
  return new Promise((resolve, reject) => {
    if (!id) return reject(new Error('Lecture id is required'));

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

    const q = `UPDATE lectures SET ${setClauses.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`;
    params.push(id);

    db.query(q, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function createBlankLecture(userSub, title = 'Untitled Lecture', description = '') {
  return new Promise((resolve, reject) => {
    if (!userSub) return reject(new Error('userSub required'));
    if (!title) title = 'Untitled Lecture';
    const q = `INSERT INTO lectures (title, description, createdBy) VALUES (?, ?, ?)`;
    db.query(q, [title, description, userSub], (err, results) => {
      if (err) return reject(err);
      resolve(results.insertId);
    });
  });
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
function releaseLectureToAllStudents(lectureId) {
  return new Promise((resolve, reject) => {
    if (!lectureId) return reject(new Error('lectureId is required'));

    // Step 1: fetch all student auth0_sub values (non-admin, non-educator)
    const studentQuery = `SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)`;
    db.query(studentQuery, async (err, rows) => {
      if (err) return reject(err);
      if (!rows || rows.length === 0) return resolve(0);

      const values = rows.map(r => [lectureId, r.auth0_sub]);
      // MySQL bulk insert with IGNORE to avoid duplicates if already released
      const insertSql = 'INSERT IGNORE INTO lecture_access (lectureId, userSub) VALUES ?';
      db.query(insertSql, [values], (insertErr, result) => {
        if (insertErr) return reject(insertErr);
        const inserted = result ? result.affectedRows : 0;
        // update lastReleasedAt timestamp
        db.query('UPDATE lectures SET lastReleasedAt = NOW() WHERE id = ?', [lectureId], () => {});
        resolve(inserted);
      });
    });
  });
}

/**
 * Fetch all lectures that have been released to a given user via lecture_access.
 * Returns array with the core lecture fields plus the release timestamp.
 */
function getAccessibleLecturesForUser(userSub) {
  return new Promise((resolve, reject) => {
    if (!userSub) return reject(new Error('userSub required'));
    const sql = `SELECT l.id, l.title, l.description, l.linkUrl, l.fileNameServer, l.originalName,
                        l.lastReleasedAt, la.releasedAt
                 FROM lectures l
                 INNER JOIN lecture_access la ON la.lectureId = l.id
                 WHERE la.userSub = ?
                 ORDER BY la.releasedAt DESC`;
    db.query(sql, [userSub], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function submitLectureForApproval(lectureId, userSub) {
  return new Promise((resolve, reject) => {
    if (!lectureId || !userSub) return reject(new Error('lectureId and userSub required'));
    // Ensure the user is the owner of the lecture and it is currently in DRAFT status
    const selectSql = 'SELECT approvalStatus, createdBy FROM lectures WHERE id = ? LIMIT 1';
    db.query(selectSql, [lectureId], (selErr, rows) => {
      if (selErr) return reject(selErr);
      if (!rows || rows.length === 0) return reject(new Error('Lecture not found'));
      const row = rows[0];
      if (row.createdBy !== userSub) return reject(new Error('You are not the owner of this lecture'));
      const status = row.approvalStatus;
      if (status && status !== 'DRAFT') {
        return reject(new Error('Lecture cannot be submitted for approval in its current state'));
      }
      const updateSql = "UPDATE lectures SET approvalStatus = 'PENDING', approvedBy = NULL, approvedAt = NULL WHERE id = ?";
      db.query(updateSql, [lectureId], (updErr) => {
        if (updErr) return reject(updErr);
        resolve();
      });
    });
  });
}

function approveLecture(lectureId, adminSub) {
  return new Promise((resolve, reject) => {
    if (!lectureId || !adminSub) return reject(new Error('lectureId and adminSub required'));
    const selectSql = 'SELECT approvalStatus FROM lectures WHERE id = ? LIMIT 1';
    db.query(selectSql, [lectureId], (selErr, rows) => {
      if (selErr) return reject(selErr);
      if (!rows || rows.length === 0) return reject(new Error('Lecture not found'));
      const status = rows[0].approvalStatus;
      if (status && status !== 'PENDING' && status !== 'DRAFT') {
        return reject(new Error('Lecture cannot be approved in its current state'));
      }

      // --- New validation: ensure lecture has questions and that each question has at least one tag ---
      // 1) Ensure at least one question exists for the lecture
      const countQuestionsSql = 'SELECT COUNT(*) AS cnt FROM questions WHERE lectureId = ?';
      db.query(countQuestionsSql, [lectureId], (cntErr, cntRows) => {
        if (cntErr) return reject(cntErr);
        const totalQuestions = cntRows && cntRows.length ? cntRows[0].cnt : 0;
        if (totalQuestions === 0) {
          return reject(new Error('Lecture must contain at least one question before approval'));
        }

        // 2) Ensure every question linked to this lecture has at least one tag
        const missingTagsSql = `SELECT q.id
                                 FROM questions q
                                 LEFT JOIN question_tags qt ON qt.questionId = q.id
                                 WHERE q.lectureId = ?
                                 GROUP BY q.id
                                 HAVING COUNT(qt.tagId) = 0
                                 LIMIT 1`;
        db.query(missingTagsSql, [lectureId], (tagErr, tagRows) => {
          if (tagErr) return reject(tagErr);
          if (tagRows && tagRows.length > 0) {
            return reject(new Error('All questions must have at least one tag before lecture can be approved'));
          }

          // If validation passes, proceed to approve lecture
          const updateSql = "UPDATE lectures SET approvalStatus = 'APPROVED', approvedBy = ?, approvedAt = NOW() WHERE id = ?";
          db.query(updateSql, [adminSub, lectureId], (updErr) => {
            if (updErr) return reject(updErr);
            resolve();
          });
        });
      });
    });
  });
}

function denyLecture(lectureId, adminSub) {
  return new Promise((resolve, reject) => {
    if (!lectureId || !adminSub) return reject(new Error('lectureId and adminSub required'));
    // Fetch lecture to obtain current status and owner for downstream processing
    const selectSql = 'SELECT approvalStatus, createdBy, title FROM lectures WHERE id = ? LIMIT 1';
    db.query(selectSql, [lectureId], async (selErr, rows) => {
      if (selErr) return reject(selErr);
      if (!rows || rows.length === 0) return reject(new Error('Lecture not found'));

      const { approvalStatus: status, createdBy, title } = rows[0];
      if (status === 'DRAFT') {
        // Already draft – nothing to do but still resolve with owner/title so caller can notify
        return resolve({ createdBy, title });
      }
      // Only lectures that are not approved can be denied; if already approved, require un-approve flow
      // but for now allow reverting any non-draft status back to draft
      const updateSql = "UPDATE lectures SET approvalStatus = 'DRAFT', approvedBy = NULL, approvedAt = NULL WHERE id = ?";
      db.query(updateSql, [lectureId], (updErr) => {
        if (updErr) return reject(updErr);
        resolve({ createdBy, title });
      });
    });
  });
}

module.exports = { createLectureLink, createLectureFile, getLecturesForUser, getAllLectures, updateLecture, createBlankLecture, releaseLectureToAllStudents, getAccessibleLecturesForUser, submitLectureForApproval, approveLecture, denyLecture }; 