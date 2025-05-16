// journalOperations.js
// Helper functions for Reflection Journal feature.
// Provides CRUD for prompts plus response recording & stats.

const { db } = require('./db');

/* ---------------- Prompt helpers ---------------- */

function createJournalPrompt(title, promptText, createdBy) {
  return new Promise((resolve, reject) => {
    if (!title || !promptText || !createdBy) {
      return reject(new Error('Missing required fields'));
    }
    const sql = `INSERT INTO journal_prompts (title, promptText, createdBy) VALUES (?, ?, ?)`;
    db.query(sql, [title, promptText, createdBy], (err, results) => {
      if (err) return reject(err);
      resolve(results.insertId);
    });
  });
}

function updateJournalPrompt(id, fields) {
  return new Promise((resolve, reject) => {
    if (!id) return reject(new Error('id required'));
    const allowed = ['title', 'promptText'];
    const setClauses = [];
    const params = [];
    allowed.forEach((f) => {
      if (fields.hasOwnProperty(f)) {
        setClauses.push(`${f} = ?`);
        params.push(fields[f]);
      }
    });
    if (setClauses.length === 0) return reject(new Error('No valid fields provided'));
    const sql = `UPDATE journal_prompts SET ${setClauses.join(', ')}, updatedAt = NOW() WHERE id = ?`;
    params.push(id);
    db.query(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function deleteJournalPrompt(id) {
  return new Promise((resolve, reject) => {
    const sql = 'DELETE FROM journal_prompts WHERE id = ?';
    db.query(sql, [id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getAllJournalPrompts() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT jp.id, jp.title, jp.promptText, jp.createdBy, jp.createdAt,
                        MAX(ja.releasedAt) AS lastReleasedAt
                 FROM journal_prompts jp
                 LEFT JOIN journal_access ja ON ja.promptId = jp.id
                 GROUP BY jp.id
                 ORDER BY jp.id DESC`;
    db.query(sql, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getJournalPrompt(id) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM journal_prompts WHERE id = ? LIMIT 1';
    db.query(sql, [id], (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Prompt not found'));
      resolve(rows[0]);
    });
  });
}

/* ---------------- Response helpers ---------------- */

function _calculateCharCount(txt) {
  if (!txt) return 0;
  return txt.replace(/\r?\n/g, '').length;
}

function upsertJournalResponse(promptId, userSub, responseText) {
  return new Promise((resolve, reject) => {
    if (!promptId || !userSub) return reject(new Error('promptId and userSub required'));
    const charCount = _calculateCharCount(responseText);
    const sql = `INSERT INTO journal_responses (promptId, userSub, responseText, charCount)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE responseText = VALUES(responseText), charCount = VALUES(charCount), submittedAt = CURRENT_TIMESTAMP`;
    db.query(sql, [promptId, userSub, responseText, charCount], (err) => {
      if (err) return reject(err);
      resolve(charCount);
    });
  });
}

function getJournalResponse(promptId, userSub) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT responseText, charCount, submittedAt FROM journal_responses WHERE promptId = ? AND userSub = ? LIMIT 1';
    db.query(sql, [promptId, userSub], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.length ? rows[0] : null);
    });
  });
}

function getPromptStats(promptId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT jr.userSub, ua.display_name AS displayName, jr.charCount, jr.submittedAt
                 FROM journal_responses jr
                 LEFT JOIN UserAccounts ua ON ua.auth0_sub = jr.userSub
                 WHERE jr.promptId = ?
                 ORDER BY jr.submittedAt DESC`;
    db.query(sql, [promptId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/* ---------------- Student list helpers ---------------- */
function getPromptsForStudent(userSub) {
  // For now: all prompts are visible to every student.
  // Could extend to assignment table later.
  return new Promise((resolve, reject) => {
    getAllJournalPrompts()
      .then(async (prompts) => {
        const results = [];
        for (const p of prompts) {
          const resp = await new Promise((res, rej) => {
            db.query('SELECT charCount FROM journal_responses WHERE promptId = ? AND userSub = ? LIMIT 1', [p.id, userSub], (err, rows) => {
              if (err) return rej(err);
              res(rows.length ? rows[0].charCount : null);
            });
          });
          results.push({
            id: p.id,
            title: p.title,
            promptText: p.promptText,
            charCount: resp,
          });
        }
        resolve(results);
      })
      .catch(reject);
  });
}

/* ---------------- Release helpers ---------------- */

function releasePromptToAllStudents(promptId) {
  return new Promise((resolve, reject) => {
    if (!promptId) return reject(new Error('promptId required'));

    // Fetch all non-educator users (admins included so they can receive prompts if desired)
    db.query('SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)', (err, rows) => {
      if (err) return reject(err);
      if (!rows || !rows.length) return resolve(0);

      const values = rows.map(r => [promptId, r.auth0_sub]);
      const sql = 'INSERT IGNORE INTO journal_access (promptId, userSub) VALUES ?';
      db.query(sql, [values], (insErr, result) => {
        if (insErr) return reject(insErr);
        const inserted = result ? result.affectedRows : 0;
        resolve(inserted);
      });
    });
  });
}

function getPromptRecipients(promptId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT ja.userSub, ua.display_name AS displayName, ja.releasedAt
                 FROM journal_access ja
                 LEFT JOIN UserAccounts ua ON ua.auth0_sub = ja.userSub
                 WHERE ja.promptId = ? ORDER BY ja.releasedAt DESC`;
    db.query(sql, [promptId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = {
  createJournalPrompt,
  updateJournalPrompt,
  deleteJournalPrompt,
  getAllJournalPrompts,
  getJournalPrompt,
  upsertJournalResponse,
  getJournalResponse,
  getPromptStats,
  getPromptsForStudent,
  releasePromptToAllStudents,
  getPromptRecipients,
}; 