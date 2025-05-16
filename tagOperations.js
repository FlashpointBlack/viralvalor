// tagOperations.js
// Utility functions for tag CRUD operations and linking tags to questions.
// Depends on MySQL connection exported from db.js

const { db } = require('./db');

/**
 * Create a new tag or return existing tag id if name already exists (case-insensitive).
 * Only educators / admins should be allowed to create via route-level checks.
 *
 * @param {string} name        Tag name (max 100 chars suggested)
 * @param {string} createdBy   Auth0 sub of creator (for auditing)
 * @returns {Promise<number>}  Newly created or existing tag ID
 */
function createTag(name, createdBy) {
    return new Promise((resolve, reject) => {
        if (!name) return reject(new Error('name is required'));
        // Use INSERT ... ON DUPLICATE KEY to avoid duplicates (unique index on name)
        const query = `INSERT INTO tags (name, createdBy, createdAt)
                       VALUES (?, ?, NOW())
                       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`;
        db.query(query, [name.trim(), createdBy], (err, result) => {
            if (err) return reject(err);
            resolve(result.insertId);
        });
    });
}

/**
 * Fetch all tags sorted alphabetically.
 * @returns {Promise<Array<{id:number,name:string}>>}
 */
function getAllTags() {
    return new Promise((resolve, reject) => {
        db.query('SELECT id, name FROM tags ORDER BY name ASC', (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

/**
 * Replace tags for a question (many-to-many join table question_tags).
 * This function removes existing links and inserts the provided ones.
 * @param {number} questionId
 * @param {number[]} tagIds
 */
function setQuestionTags(questionId, tagIds) {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(tagIds)) return reject(new Error('tagIds must be an array'));
        // Delete existing
        db.query('DELETE FROM question_tags WHERE questionId = ?', [questionId], (delErr) => {
            if (delErr) return reject(delErr);
            if (tagIds.length === 0) return resolve();
            const values = tagIds.map(id => [questionId, id]);
            db.query('INSERT IGNORE INTO question_tags (questionId, tagId) VALUES ?', [values], (insErr) => {
                if (insErr) return reject(insErr);
                resolve();
            });
        });
    });
}

/**
 * Get tags linked to a question.
 * @param {number} questionId
 * @returns {Promise<Array<{id:number,name:string}>>}
 */
function getTagsForQuestion(questionId) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT t.id, t.name
                     FROM tags t
                     INNER JOIN question_tags qt ON qt.tagId = t.id
                     WHERE qt.questionId = ?
                     ORDER BY t.name ASC`;
        db.query(sql, [questionId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

module.exports = {
    createTag,
    getAllTags,
    setQuestionTags,
    getTagsForQuestion
}; 