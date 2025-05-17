// journalOperations.js
// Helper functions for Reflection Journal feature.
// Provides CRUD for prompts plus response recording & stats.

const { dbPromise } = require('./db');

/* ---------------- Prompt helpers ---------------- */

async function createJournalPrompt(title, promptText, createdBy) {
  if (!title || !promptText || !createdBy) {
    throw new Error('Missing required fields');
  }
  const sql = `INSERT INTO journal_prompts (title, promptText, createdBy) VALUES (?, ?, ?)`;
  const [result] = await dbPromise.query(sql, [title, promptText, createdBy]);
  return result.insertId;
}

async function updateJournalPrompt(id, fields) {
  if (!id) throw new Error('id required');
  const allowed = ['title', 'promptText'];
  const setClauses = [];
  const params = [];
  allowed.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(fields, f)) {
      setClauses.push(`${f} = ?`);
      params.push(fields[f]);
    }
  });
  if (!setClauses.length) throw new Error('No valid fields provided');
  const sql = `UPDATE journal_prompts SET ${setClauses.join(', ')}, updatedAt = NOW() WHERE id = ?`;
  params.push(id);
  await dbPromise.query(sql, params);
}

async function deleteJournalPrompt(id) {
  const sql = 'DELETE FROM journal_prompts WHERE id = ?';
  await dbPromise.query(sql, [id]);
}

async function getAllJournalPrompts() {
  const sql = `SELECT jp.id, jp.title, jp.promptText, jp.createdBy, jp.createdAt,
                      MAX(ja.releasedAt) AS lastReleasedAt
               FROM journal_prompts jp
               LEFT JOIN journal_access ja ON ja.promptId = jp.id
               GROUP BY jp.id
               ORDER BY jp.id DESC`;
  const [rows] = await dbPromise.query(sql);
  return rows;
}

async function getJournalPrompt(id) {
  const sql = 'SELECT * FROM journal_prompts WHERE id = ? LIMIT 1';
  const [rows] = await dbPromise.query(sql, [id]);
  if (!rows.length) throw new Error('Prompt not found');
  return rows[0];
}

/* ---------------- Response helpers ---------------- */

function _calculateCharCount(txt) {
  if (!txt) return 0;
  return txt.replace(/\r?\n/g, '').length;
}

async function upsertJournalResponse(promptId, userSub, responseText) {
  if (!promptId || !userSub) throw new Error('promptId and userSub required');
  const charCount = _calculateCharCount(responseText);
  const sql = `INSERT INTO journal_responses (promptId, userSub, responseText, charCount)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE responseText = VALUES(responseText), charCount = VALUES(charCount), submittedAt = CURRENT_TIMESTAMP`;
  await dbPromise.query(sql, [promptId, userSub, responseText, charCount]);
  return charCount;
}

async function getJournalResponse(promptId, userSub) {
  const sql = 'SELECT responseText, charCount, submittedAt FROM journal_responses WHERE promptId = ? AND userSub = ? LIMIT 1';
  const [rows] = await dbPromise.query(sql, [promptId, userSub]);
  return rows.length ? rows[0] : null;
}

async function getPromptStats(promptId) {
  const sql = `SELECT jr.userSub, ua.display_name AS displayName, jr.charCount, jr.submittedAt
               FROM journal_responses jr
               LEFT JOIN UserAccounts ua ON ua.auth0_sub = jr.userSub
               WHERE jr.promptId = ?
               ORDER BY jr.submittedAt DESC`;
  const [rows] = await dbPromise.query(sql, [promptId]);
  return rows;
}

/* ---------------- Student list helpers ---------------- */
async function getPromptsForStudent(userSub) {
  // For now: all prompts are visible to every student.
  // Could extend to assignment table later.
  const prompts = await getAllJournalPrompts();
  const results = [];
  for (const p of prompts) {
    const [charRows] = await dbPromise.query(
      'SELECT charCount FROM journal_responses WHERE promptId = ? AND userSub = ? LIMIT 1',
      [p.id, userSub]
    );
    results.push({
      id: p.id,
      title: p.title,
      promptText: p.promptText,
      charCount: charRows.length ? charRows[0].charCount : null,
    });
  }
  return results;
}

/* ---------------- Release helpers ---------------- */

async function releasePromptToAllStudents(promptId) {
  if (!promptId) throw new Error('promptId required');

  // Fetch all non-educator users (admins included so they can receive prompts if desired)
  const [userRows] = await dbPromise.query(
    'SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)'
  );
  if (!userRows || !userRows.length) return 0;

  const values = userRows.map((r) => [promptId, r.auth0_sub]);
  const sql = 'INSERT IGNORE INTO journal_access (promptId, userSub) VALUES ?';
  const [result] = await dbPromise.query(sql, [values]);
  return result ? result.affectedRows || 0 : 0;
}

async function getPromptRecipients(promptId) {
  const sql = `SELECT ja.userSub, ua.display_name AS displayName, ja.releasedAt
               FROM journal_access ja
               LEFT JOIN UserAccounts ua ON ua.auth0_sub = ja.userSub
               WHERE ja.promptId = ? ORDER BY ja.releasedAt DESC`;
  const [rows] = await dbPromise.query(sql, [promptId]);
  return rows;
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