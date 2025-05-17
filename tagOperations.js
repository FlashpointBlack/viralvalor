// tagOperations.js
// Utility functions for tag CRUD operations and linking tags to questions.
// Depends on MySQL connection exported from db.js

const { dbPromise } = require('./db');

/**
 * Create a new tag or return existing tag id if name already exists (case-insensitive).
 * Only educators / admins should be allowed to create via route-level checks.
 *
 * @param {string} name        Tag name (max 100 chars suggested)
 * @param {string} createdBy   Auth0 sub of creator (for auditing)
 * @returns {Promise<number>}  Newly created or existing tag ID
 */
async function createTag(name, createdBy) {
    if (!name) throw new Error('name is required');
    const query = `INSERT INTO tags (name, createdBy, createdAt)
                   VALUES (?, ?, NOW())
                   ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`;
    const [result] = await dbPromise.query(query, [name.trim(), createdBy]);
    return result.insertId;
}

/**
 * Fetch all tags sorted alphabetically.
 * @returns {Promise<Array<{id:number,name:string}>>}
 */
async function getAllTags() {
    const [rows] = await dbPromise.query('SELECT id, name FROM tags ORDER BY name ASC');
    return rows;
}

/**
 * Replace tags for a question (many-to-many join table question_tags).
 * This function removes existing links and inserts the provided ones.
 * @param {number} questionId
 * @param {number[]} tagIds
 */
async function setQuestionTags(questionId, tagIds) {
    if (!Array.isArray(tagIds)) throw new Error('tagIds must be an array');
    // Delete existing links first
    await dbPromise.query('DELETE FROM question_tags WHERE questionId = ?', [questionId]);
    if (tagIds.length === 0) return;
    const values = tagIds.map(id => [questionId, id]);
    await dbPromise.query('INSERT IGNORE INTO question_tags (questionId, tagId) VALUES ?', [values]);
}

/**
 * Get tags linked to a question.
 * @param {number} questionId
 * @returns {Promise<Array<{id:number,name:string}>>}
 */
async function getTagsForQuestion(questionId) {
    const sql = `SELECT t.id, t.name
                 FROM tags t
                 INNER JOIN question_tags qt ON qt.tagId = t.id
                 WHERE qt.questionId = ?
                 ORDER BY t.name ASC`;
    const [rows] = await dbPromise.query(sql, [questionId]);
    return rows;
}

module.exports = {
    createTag,
    getAllTags,
    setQuestionTags,
    getTagsForQuestion
}; 