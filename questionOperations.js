// questionOperations.js
// Helper functions for MySQL operations related to Question Bank functionality.
// Similar structure to encounterOperations.js but scoped for questions and their multiple-choice options.

const { dbPromise } = require('./db');

/**
 * Create a new blank question owned by the given user.
 * Uses new simplified schema: questions(id, text, options(JSON), correctOptionIndex, createdBy, createdAt, updatedAt)
 */
function createBlankQuestion(userSub, lectureId = null) {
    if (!userSub) return Promise.reject(new Error('userSub is required'));

    return new Promise((resolve, reject) => {
        const query = `INSERT INTO questions (text, options, correctOptionIndex, rationale_correct, rationale_incorrect, createdBy, lectureId, createdAt, updatedAt)
                       VALUES ('', '[]', NULL, '', '', ?, ?, NOW(), NOW())`;
        dbPromise
            .query(query, [userSub, lectureId])
            .then(([results]) => resolve(results.insertId))
            .catch((err) => reject(err));
    });
}

/**
 * Update a single field on a question record based on external (frontend) field name.
 * The caller must ensure field is whitelisted.
 * Accepts mapping from frontend field names to DB column names.
 */
function updateQuestionField(id, field, value) {
    const fieldMap = {
        QuestionText: 'text',
        options: 'options',
        correctOptionIndex: 'correctOptionIndex',
        RationaleCorrect: 'rationale_correct',
        RationaleIncorrect: 'rationale_incorrect'
    };
    const column = fieldMap[field] || field; // fallback to provided

    return new Promise((resolve, reject) => {
        const query = 'UPDATE questions SET ?? = ?, updatedAt = NOW() WHERE id = ?';
        dbPromise
            .query(query, [column, value, id])
            .then(() => resolve())
            .catch((err) => reject(err));
    });
}

/**
 * Delete a question row completely.
 */
function deleteQuestion(id) {
    return new Promise((resolve, reject) => {
        const query = 'DELETE FROM questions WHERE id = ?';
        dbPromise
            .query(query, [id])
            .then(() => resolve())
            .catch((err) => reject(err));
    });
}

/* ---------------- Option helpers (JSON column) ------------------------- */

function _getQuestionRow(id) {
    return new Promise((resolve, reject) => {
        dbPromise
            .query('SELECT * FROM questions WHERE id = ? LIMIT 1', [id])
            .then(([rows]) => {
                if (!rows.length) return reject(new Error('Question not found'));
                resolve(rows[0]);
            })
            .catch((err) => reject(err));
    });
}

function _saveOptions(questionId, options, correctOptionIndex = null) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE questions SET options = ?, correctOptionIndex = ?, updatedAt = NOW() WHERE id = ?';
        dbPromise
            .query(query, [JSON.stringify(options), correctOptionIndex, questionId])
            .then(() => resolve())
            .catch((err) => reject(err));
    });
}

/**
 * Create a blank option in the options array. Returns new option id.
 */
function createQuestionOption(questionId, userSub) {
    return new Promise(async (resolve, reject) => {
        try {
            const row = await _getQuestionRow(questionId);
            const options = parseOptions(row.options);
            // Generate simple incremental ID
            const nextId = options.reduce((max, o) => Math.max(max, o.ID || 0), 0) + 1;
            // Include a blank Rationale field for the new option so educators can fill it in later
            options.push({ ID: nextId, OptionText: '', Rationale: '' });
            await _saveOptions(questionId, options, row.correctOptionIndex);
            resolve(nextId);
        } catch (err) {
            reject(err);
        }
    });
}

function updateQuestionOption(optionId, text = undefined, rationale = undefined, questionId = null) {
    return new Promise(async (resolve, reject) => {
        try {
            let row;
            if (questionId) {
                row = await _getQuestionRow(questionId);
            } else {
                // Fallback: need to search across questions (inefficient but acceptable for small dataset)
                const [rows] = await new Promise((res, rej) => {
                    dbPromise.query('SELECT * FROM questions').then(([rs]) => res([rs]));
                });
                row = rows.find(r => {
                    const opts = parseOptions(r.options);
                    return opts.some(o => o.ID === optionId);
                });
                if (!row) throw new Error('Question containing option not found');
            }

            const options = parseOptions(row.options);
            const idx = options.findIndex(o => o.ID === optionId);
            if (idx === -1) throw new Error('Option not found');

            // Apply updates conditionally so callers can update either field independently
            if (text !== undefined) options[idx].OptionText = text;
            if (rationale !== undefined) options[idx].Rationale = rationale;

            await _saveOptions(row.id, options, row.correctOptionIndex);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

function deleteQuestionOption(optionId) {
    return new Promise(async (resolve, reject) => {
        try {
            // locate question row
            const [rows] = await new Promise((res, rej) => {
                dbPromise.query('SELECT * FROM questions').then(([rs]) => res([rs]));
            });
            const row = rows.find(r => {
                const opts = parseOptions(r.options);
                return opts.some(o => o.ID === optionId);
            });
            if (!row) throw new Error('Question containing option not found');
            let options = parseOptions(row.options);
            options = options.filter(o => o.ID !== optionId);
            // If the deleted option was the correct one, reset correctOptionIndex
            const newCorrect = row.correctOptionIndex === optionId ? null : row.correctOptionIndex;
            await _saveOptions(row.id, options, newCorrect);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

function setCorrectOption(questionId, optionId) {
    return new Promise(async (resolve, reject) => {
        try {
            const row = await _getQuestionRow(questionId);
            // verify option exists
            const options = parseOptions(row.options);
            if (!options.some(o => o.ID === optionId)) throw new Error('Option not found');
            await _saveOptions(questionId, options, optionId);
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Fetch questions created by a given user.
 * Returns array transformed to match legacy frontend expectations.
 */
function getQuestionsByUser(userSub) {
    return new Promise((resolve, reject) => {
        const query = 'SELECT id, text, options, correctOptionIndex, createdBy FROM questions WHERE createdBy = ? ORDER BY id DESC';
        dbPromise
            .query(query, [userSub])
            .then(([results]) => {
                const transformed = results.map(r => ({
                    ID: r.id,
                    QuestionText: r.text,
                    // Not including options here for list view
                }));
                resolve(transformed);
            })
            .catch((err) => reject(err));
    });
}

/**
 * Fetch full question with options transformed for frontend.
 */
function getQuestionWithOptions(questionId) {
    return new Promise((resolve, reject) => {
        const query = 'SELECT * FROM questions WHERE id = ? LIMIT 1';
        dbPromise
            .query(query, [questionId])
            .then(async ([rows]) => {
                if (!rows.length) return reject(new Error('Question not found'));
                const r = rows[0];
                // Fetch tags for this question
                let tags = [];
                try {
                    const { getTagsForQuestion } = require('./tagOperations');
                    tags = await getTagsForQuestion(questionId);
                } catch (tagErr) {
                    console.error('[getQuestionWithOptions] Failed to fetch tags', tagErr);
                }
                const optionsRaw = parseOptions(r.options);
                const options = optionsRaw.map(o => ({
                    ID: o.ID,
                    OptionText: o.OptionText,
                    Rationale: o.Rationale || '',
                    IsCorrect: r.correctOptionIndex !== null && o.ID === r.correctOptionIndex ? 1 : 0
                }));
                resolve({
                    ID: r.id,
                    QuestionText: r.text,
                    RationaleCorrect: r.rationale_correct || '',
                    RationaleIncorrect: r.rationale_incorrect || '',
                    options,
                    tags, // array of {id, name}
                    _REC_Creation_User: r.createdBy
                });
            })
            .catch((err) => reject(err));
    });
}

/**
 * Fetch all questions (admin view).
 */
function getAllQuestions() {
    return new Promise((resolve, reject) => {
        const query = 'SELECT id, text FROM questions ORDER BY id DESC';
        dbPromise
            .query(query)
            .then(([results]) => {
                const transformed = results.map(r => ({ ID: r.id, QuestionText: r.text }));
                resolve(transformed);
            })
            .catch((err) => reject(err));
    });
}

// Helper to safely parse the JSON column which may already be returned as an object/array
function parseOptions(raw) {
    if (!raw) return [];
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('[parseOptions] Failed to parse options JSON', e);
            return [];
        }
    }
    // Already an object/array
    return raw;
}

/**
 * Record a student attempt at a question.
 * Stores the selected option and whether it was correct.
 * Returns the insert id and correctness flag.
 */
function recordQuestionAttempt(questionId, userSub, selectedOptionId, timeTakenMs = null) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!questionId || !userSub || selectedOptionId === undefined || selectedOptionId === null) {
                throw new Error('Missing required parameters');
            }

            // Fetch the question to determine correctness
            const questionRow = await _getQuestionRow(questionId);
            const isCorrect = questionRow.correctOptionIndex !== null && questionRow.correctOptionIndex == selectedOptionId ? 1 : 0;

            const attemptInsertQuery = `INSERT INTO question_attempts
                (questionId, userSub, selectedOptionId, isCorrect, timeTakenMs, attemptDate)
                VALUES (?, ?, ?, ?, ?, NOW())`;
            dbPromise
                .query(attemptInsertQuery, [questionId, userSub, selectedOptionId, isCorrect, timeTakenMs])
                .then(([results]) => {
                    // Determine rationale: prefer option-specific rationale if provided
                    let rationale = '';
                    try {
                        const opts = parseOptions(questionRow.options);
                        const selectedOpt = opts.find(o => o.ID == selectedOptionId);
                        if (selectedOpt && selectedOpt.Rationale && selectedOpt.Rationale.trim() !== '') {
                            rationale = selectedOpt.Rationale;
                        } else {
                            // Fallback to generic correct/incorrect rationale columns for backward compatibility
                            rationale = isCorrect ? (questionRow.rationale_correct || '') : (questionRow.rationale_incorrect || '');
                        }
                    } catch (e) {
                        // In case of parsing errors, fallback to generic
                        rationale = isCorrect ? (questionRow.rationale_correct || '') : (questionRow.rationale_incorrect || '');
                    }
                    resolve({ attemptId: results.insertId, isCorrect, rationale });
                })
                .catch((err) => reject(err));
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Get attempts for a given user. Optionally filter by question.
 */
function getAttemptsForUser(userSub, questionId = null) {
    return new Promise((resolve, reject) => {
        if (!userSub) return reject(new Error('userSub is required'));
        let query = 'SELECT * FROM question_attempts WHERE userSub = ?';
        const params = [userSub];
        if (questionId) {
            query += ' AND questionId = ?';
            params.push(questionId);
        }
        query += ' ORDER BY attemptDate DESC';
        dbPromise
            .query(query, params)
            .then(([rows]) => resolve(rows))
            .catch((err) => reject(err));
    });
}

/**
 * Fetch a question formatted for students (no correct flags).
 */
function getQuestionForStudent(questionId) {
    return new Promise((resolve, reject) => {
        const query = 'SELECT id, text, options FROM questions WHERE id = ? LIMIT 1';
        dbPromise
            .query(query, [questionId])
            .then(([rows]) => {
                if (!rows.length) return reject(new Error('Question not found'));
                const r = rows[0];
                const optionsRaw = parseOptions(r.options);
                const options = optionsRaw.map(o => ({ ID: o.ID, OptionText: o.OptionText }));
                resolve({ ID: r.id, QuestionText: r.text, options });
            })
            .catch((err) => reject(err));
    });
}

/**
 * Fetch questions belonging to a given lecture.
 * Optional tagId filter (admin use).
 * Returns array {ID, QuestionText}
 */
function getQuestionsByLecture(lectureId, tagId = null) {
    return new Promise((resolve, reject) => {
        if (!lectureId) return reject(new Error('lectureId required'));
        let sql = `SELECT q.id, q.text FROM questions q`;
        const params = [];
        if (tagId) {
            sql += ` INNER JOIN question_tags qt ON qt.questionId = q.id`;
        }
        sql += ` WHERE q.lectureId = ?`;
        params.push(lectureId);
        if (tagId) {
            sql += ` AND qt.tagId = ?`;
            params.push(tagId);
        }
        sql += ` ORDER BY q.id DESC`;

        dbPromise
            .query(sql, params)
            .then(([rows]) => {
                const transformed = rows.map(r => ({ ID: r.id, QuestionText: r.text }));
                resolve(transformed);
            })
            .catch((err) => reject(err));
    });
}

/**
 * Fetch all questions that have a specific tag (admin use).
 * Returns array {ID, QuestionText}
 */
function getQuestionsByTag(tagId) {
    return new Promise((resolve, reject) => {
        if (!tagId) return reject(new Error('tagId required'));
        const sql = `SELECT q.id, q.text
                     FROM questions q
                     INNER JOIN question_tags qt ON qt.questionId = q.id
                     WHERE qt.tagId = ?
                     ORDER BY q.id DESC`;
        dbPromise
            .query(sql, [tagId])
            .then(([rows]) => {
                const transformed = rows.map(r => ({ ID: r.id, QuestionText: r.text }));
                resolve(transformed);
            })
            .catch((err) => reject(err));
    });
}

/**
 * Fetch list of questions a given student has access to based on lecture_access joins.
 * Returns array {ID, QuestionText}
 */
function getStudentAccessibleQuestions(userSub) {
    return new Promise((resolve, reject) => {
        if (!userSub) return reject(new Error('userSub required'));
        const sql = `SELECT q.id, q.text
                    FROM questions q
                    INNER JOIN lecture_access la ON la.lectureId = q.lectureId
                    WHERE la.userSub = ?
                    ORDER BY q.id DESC`;
        dbPromise
            .query(sql, [userSub])
            .then(([rows]) => {
                const transformed = rows.map(r => ({ ID: r.id, QuestionText: r.text }));
                resolve(transformed);
            })
            .catch((err) => reject(err));
    });
}

/**
 * Aggregate statistics for a user's question practice.
 * Returns an object with totalAttempts, distinctQuestions, correctCount, accuracy (0-1),
 * avgTimeMs, fastestTimeMs, slowestTimeMs, lastAttemptDate.
 */
function getAttemptStatsForUser(userSub, startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
        if (!userSub) return reject(new Error('userSub required'));
        let sql = `SELECT
                        COUNT(*) AS totalAttempts,
                        COUNT(DISTINCT questionId) AS distinctQuestions,
                        SUM(isCorrect) AS correctCount,
                        AVG(isCorrect) AS accuracy,
                        AVG(timeTakenMs) AS avgTimeMs,
                        MIN(timeTakenMs) AS fastestTimeMs,
                        MAX(timeTakenMs) AS slowestTimeMs,
                        MAX(attemptDate) AS lastAttemptDate
                     FROM question_attempts
                     WHERE userSub = ?`;
        const params = [userSub];
        if (startDate) {
            sql += ' AND attemptDate >= ?';
            params.push(startDate);
        }
        if (endDate) {
            sql += ' AND attemptDate < DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(endDate);
        }
        dbPromise
            .query(sql, params)
            .then(([rows]) => {
                const stats = rows && rows.length ? rows[0] : null;
                // Coerce numeric fields to numbers (they may come back as strings in MySQL driver)
                if (stats) {
                    Object.keys(stats).forEach(k => {
                        if (k !== 'lastAttemptDate' && stats[k] !== null && stats[k] !== undefined) {
                            stats[k] = Number(stats[k]);
                        }
                    });
                }
                // Fetch fastest & slowest question texts
                const dateFilter = {
                    start: startDate ? ' AND attemptDate >= ?' : '',
                    end: endDate ? ' AND attemptDate < DATE_ADD(?, INTERVAL 1 DAY)' : ''
                };

                const fastParams = [userSub];
                if (startDate) fastParams.push(startDate);
                if (endDate) fastParams.push(endDate);
                const slowParams = [...fastParams];

                const fastSql = `SELECT qa.timeTakenMs, q.text AS questionText
                                 FROM question_attempts qa
                                 JOIN questions q ON q.id = qa.questionId
                                 WHERE qa.userSub = ?${dateFilter.start}${dateFilter.end}
                                 ORDER BY qa.timeTakenMs ASC LIMIT 1`;

                const slowSql = `SELECT qa.timeTakenMs, q.text AS questionText
                                 FROM question_attempts qa
                                 JOIN questions q ON q.id = qa.questionId
                                 WHERE qa.userSub = ?${dateFilter.start}${dateFilter.end}
                                 ORDER BY qa.timeTakenMs DESC LIMIT 1`;

                dbPromise
                    .query(fastSql, fastParams)
                    .then(([fastRows]) => {
                        dbPromise
                            .query(slowSql, slowParams)
                            .then(([slowRows]) => {
                                const fastest = fastRows && fastRows.length ? fastRows[0] : null;
                                const slowest = slowRows && slowRows.length ? slowRows[0] : null;

                                resolve({
                                    ...(stats || {}),
                                    fastestQuestionText: fastest ? fastest.questionText : null,
                                    fastestTimeMs: fastest ? Number(fastest.timeTakenMs) : (stats ? stats.fastestTimeMs : null),
                                    slowestQuestionText: slowest ? slowest.questionText : null,
                                    slowestTimeMs: slowest ? Number(slowest.timeTakenMs) : (stats ? stats.slowestTimeMs : null)
                                } || {
                                    totalAttempts: 0,
                                    distinctQuestions: 0,
                                    correctCount: 0,
                                    accuracy: 0,
                                    avgTimeMs: null,
                                    fastestTimeMs: null,
                                    slowestTimeMs: null,
                                    fastestQuestionText: null,
                                    slowestQuestionText: null,
                                    lastAttemptDate: null
                                });
                            })
                            .catch((err) => reject(err));
                    })
                    .catch((err) => reject(err));
            })
            .catch((err) => reject(err));
    });
}

// ADDED: Aggregate statistics for all users (admin view)
function getAttemptStatsForAllUsers(startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
        let sql = `SELECT 
                        qa.userSub,
                        COALESCE(ua.display_name, ua.nickname, ua.name, ua.email, qa.userSub) AS displayName,
                        COUNT(*) AS totalAttempts,
                        COUNT(DISTINCT qa.questionId) AS distinctQuestions,
                        SUM(qa.isCorrect) AS correctCount,
                        AVG(qa.isCorrect) AS accuracy,
                        AVG(qa.timeTakenMs) AS avgTimeMs,
                        MIN(qa.timeTakenMs) AS fastestTimeMs,
                        MAX(qa.timeTakenMs) AS slowestTimeMs,
                        MAX(qa.attemptDate) AS lastAttemptDate
                     FROM question_attempts qa
                     LEFT JOIN UserAccounts ua ON ua.auth0_sub = qa.userSub
                     WHERE 1=1`;
        const params = [];
        if (startDate) {
            sql += ' AND qa.attemptDate >= ?';
            params.push(startDate);
        }
        if (endDate) {
            sql += ' AND qa.attemptDate < DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(endDate);
        }
        sql += ' GROUP BY qa.userSub ORDER BY totalAttempts DESC';
        dbPromise
            .query(sql, params)
            .then(([rows]) => {
                // Coerce numeric fields to numbers for consistency
                const processed = rows.map(r => {
                    return {
                        ...r,
                        totalAttempts: Number(r.totalAttempts),
                        distinctQuestions: Number(r.distinctQuestions),
                        correctCount: Number(r.correctCount),
                        accuracy: r.accuracy !== null ? Number(r.accuracy) : 0,
                        avgTimeMs: r.avgTimeMs !== null ? Number(r.avgTimeMs) : null,
                        fastestTimeMs: r.fastestTimeMs !== null ? Number(r.fastestTimeMs) : null,
                        slowestTimeMs: r.slowestTimeMs !== null ? Number(r.slowestTimeMs) : null
                    };
                });
                resolve(processed);
            })
            .catch((err) => reject(err));
    });
}

////////////////////////////////////////////////////////////////
// ADDED: Aggregate statistics for all questions (admin view)
function getAttemptStatsForAllQuestions(startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
        // Build parameterized SQL using CTEs (requires MySQL 8+)
        let sql = `WITH 
base AS (
  SELECT qa.questionId,
         COUNT(*) AS totalAttempts,
         COUNT(DISTINCT qa.userSub) AS distinctUsers,
         COUNT(DISTINCT qa.questionId) AS questionCount,
         SUM(qa.isCorrect) AS correctCount,
         AVG(qa.isCorrect) AS accuracy,
         AVG(qa.timeTakenMs) AS avgTimeMs,
         MIN(qa.timeTakenMs) AS fastestTimeMs,
         SUBSTRING_INDEX(GROUP_CONCAT(qa.userSub ORDER BY qa.timeTakenMs ASC), ',', 1) AS fastestUserSub,
         MAX(qa.timeTakenMs) AS slowestTimeMs,
         SUBSTRING_INDEX(GROUP_CONCAT(qa.userSub ORDER BY qa.timeTakenMs DESC), ',', 1) AS slowestUserSub,
         MAX(qa.attemptDate) AS lastAttemptDate
  FROM question_attempts qa
  WHERE 1=1`;
        const params = [];
        if (startDate) { sql += ' AND qa.attemptDate >= ?'; params.push(startDate); }
        if (endDate) { sql += ' AND qa.attemptDate < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(endDate); }
        sql += ` GROUP BY qa.questionId
),
acc AS (
  SELECT questionId,
         MAX(userAcc) AS highestAccuracy,
         SUBSTRING_INDEX(GROUP_CONCAT(userSub ORDER BY userAcc DESC), ',', 1) AS highestAccUserSub,
         MIN(userAcc) AS lowestAccuracy,
         SUBSTRING_INDEX(GROUP_CONCAT(userSub ORDER BY userAcc ASC), ',', 1) AS lowestAccUserSub
  FROM (
    SELECT qa.questionId, qa.userSub, SUM(qa.isCorrect)/COUNT(*) AS userAcc
    FROM question_attempts qa
    WHERE 1=1`;
        if (startDate) { sql += ' AND qa.attemptDate >= ?'; params.push(startDate); }
        if (endDate) { sql += ' AND qa.attemptDate < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(endDate); }
        sql += ` GROUP BY qa.questionId, qa.userSub
  ) t
  GROUP BY questionId
)
SELECT b.*, q.text AS questionText,
       acc.highestAccuracy, acc.highestAccUserSub,
       acc.lowestAccuracy, acc.lowestAccUserSub
FROM base b
JOIN questions q ON q.id = b.questionId
LEFT JOIN acc ON acc.questionId = b.questionId
ORDER BY b.slowestTimeMs DESC`;

        dbPromise
            .query(sql, params)
            .then(async ([rows]) => {
                // Collect all unique userSubs for name resolution
                const subsSet = new Set();
                rows.forEach(r => {
                    ['fastestUserSub', 'slowestUserSub', 'highestAccUserSub', 'lowestAccUserSub'].forEach(k => {
                        if (r[k]) subsSet.add(r[k]);
                    });
                });

                let subNameMap = {};
                if (subsSet.size > 0) {
                    const subArr = Array.from(subsSet);
                    const placeholders = subArr.map(() => '?').join(',');
                    const [nameRows] = await dbPromise.query(`SELECT auth0_sub, COALESCE(display_name, nickname, name, email, auth0_sub) AS displayName FROM UserAccounts WHERE auth0_sub IN (${placeholders})`, subArr);
                    nameRows.forEach(nr => { subNameMap[nr.auth0_sub] = nr.displayName; });
                }

                const processed = rows.map(r => ({
                    questionId: r.questionId,
                    questionText: r.questionText,
                    totalAttempts: Number(r.totalAttempts),
                    distinctUsers: Number(r.distinctUsers),
                    totalQuestions: Number(r.questionCount),
                    correctCount: Number(r.correctCount),
                    accuracy: r.accuracy !== null ? Number(r.accuracy) : 0,
                    avgTimeMs: r.avgTimeMs !== null ? Number(r.avgTimeMs) : null,
                    fastestTimeMs: r.fastestTimeMs !== null ? Number(r.fastestTimeMs) : null,
                    fastestUser: r.fastestUserSub ? (subNameMap[r.fastestUserSub] || r.fastestUserSub) : null,
                    slowestTimeMs: r.slowestTimeMs !== null ? Number(r.slowestTimeMs) : null,
                    slowestUser: r.slowestUserSub ? (subNameMap[r.slowestUserSub] || r.slowestUserSub) : null,
                    highestAccuracy: r.highestAccuracy !== null ? Number(r.highestAccuracy) : null,
                    highestAccUser: r.highestAccUserSub ? (subNameMap[r.highestAccUserSub] || r.highestAccUserSub) : null,
                    lowestAccuracy: r.lowestAccuracy !== null ? Number(r.lowestAccuracy) : null,
                    lowestAccUser: r.lowestAccUserSub ? (subNameMap[r.lowestAccUserSub] || r.lowestAccUserSub) : null,
                    lastAttemptDate: r.lastAttemptDate
                }));

                resolve(processed);
            })
            .catch((err) => reject(err));
    });
}

////////////////////////////////////////////////////////////////
// ADDED: Aggregate statistics for all tags (admin view)
function getAttemptStatsForAllTags(startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
        // Parameterized SQL with CTEs – groups attempts by tagId
        let sql = `SELECT qt.tagId,
                          t.name AS tagName,
         COUNT(*) AS totalAttempts,
                          COUNT(DISTINCT qa.questionId) AS distinctQuestions,
         SUM(qa.isCorrect) AS correctCount,
         AVG(qa.isCorrect) AS accuracy,
         AVG(qa.timeTakenMs) AS avgTimeMs,
         MIN(qa.timeTakenMs) AS fastestTimeMs,
         MAX(qa.timeTakenMs) AS slowestTimeMs,
                          SUBSTRING_INDEX(GROUP_CONCAT(qa.questionId ORDER BY qa.timeTakenMs ASC), ',', 1) AS fastestQuestionId,
                          SUBSTRING_INDEX(GROUP_CONCAT(qa.questionId ORDER BY qa.timeTakenMs DESC), ',', 1) AS slowestQuestionId
  FROM question_attempts qa
  INNER JOIN question_tags qt ON qt.questionId = qa.questionId
                   INNER JOIN tags t ON t.id = qt.tagId
  WHERE 1=1`;
        const params = [];
        if (startDate) { sql += ' AND qa.attemptDate >= ?'; params.push(startDate); }
        if (endDate) { sql += ' AND qa.attemptDate < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(endDate); }
        sql += ` GROUP BY qt.tagId`;

        dbPromise
            .query(sql, params)
            .then(async ([rows]) => {
                // Collect question IDs to resolve text
                const qSet = new Set();
                rows.forEach(r => {
                    if (r.fastestQuestionId) qSet.add(Number(r.fastestQuestionId));
                    if (r.slowestQuestionId) qSet.add(Number(r.slowestQuestionId));
                });

                // Fetch question texts
                let qTextMap = {};
                if (qSet.size > 0) {
                    const qArr = Array.from(qSet);
                    const placeholders = qArr.map(() => '?').join(',');
                    const [qRows] = await dbPromise.query(`SELECT id, text FROM questions WHERE id IN (${placeholders})`, qArr);
                    qRows.forEach(qr => { qTextMap[qr.id] = qr.text; });
                }

                const processed = rows.map(r => ({
                    tagId: r.tagId,
                    tagName: r.tagName,
                    totalAttempts: Number(r.totalAttempts),
                    distinctQuestions: Number(r.distinctQuestions),
                    correctCount: Number(r.correctCount),
                    accuracy: r.accuracy !== null ? Number(r.accuracy) : 0,
                    avgTimeMs: r.avgTimeMs !== null ? Number(r.avgTimeMs) : null,
                    fastestTimeMs: r.fastestTimeMs !== null ? Number(r.fastestTimeMs) : null,
                    slowestTimeMs: r.slowestTimeMs !== null ? Number(r.slowestTimeMs) : null,
                    fastestQuestionText: r.fastestQuestionId ? (qTextMap[Number(r.fastestQuestionId)] || null) : null,
                    slowestQuestionText: r.slowestQuestionId ? (qTextMap[Number(r.slowestQuestionId)] || null) : null
                }));

                resolve(processed);
            })
            .catch((err) => reject(err));
    });
}

// NEW: Aggregate statistics by tag FOR A SINGLE USER (student practice report)
function getAttemptStatsByTagForUser(userSub, startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
        if (!userSub) return reject(new Error('userSub required'));

        let sql = `SELECT qt.tagId,
                          t.name AS tagName,
                          COUNT(*) AS totalAttempts,
                          COUNT(DISTINCT qa.questionId) AS distinctQuestions,
                          SUM(qa.isCorrect) AS correctCount,
                          AVG(qa.isCorrect) AS accuracy,
                          AVG(qa.timeTakenMs) AS avgTimeMs,
                          MIN(qa.timeTakenMs) AS fastestTimeMs,
                          MAX(qa.timeTakenMs) AS slowestTimeMs,
                          SUBSTRING_INDEX(GROUP_CONCAT(qa.questionId ORDER BY qa.timeTakenMs ASC), ',', 1) AS fastestQuestionId,
                          SUBSTRING_INDEX(GROUP_CONCAT(qa.questionId ORDER BY qa.timeTakenMs DESC), ',', 1) AS slowestQuestionId
    FROM question_attempts qa
    INNER JOIN question_tags qt ON qt.questionId = qa.questionId
                   INNER JOIN tags t ON t.id = qt.tagId
                   WHERE qa.userSub = ?`;
        const params = [userSub];
        if (startDate) { sql += ' AND qa.attemptDate >= ?'; params.push(startDate); }
        if (endDate) { sql += ' AND qa.attemptDate < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(endDate); }
        sql += ' GROUP BY qt.tagId ORDER BY t.name';

        dbPromise
            .query(sql, params)
            .then(async ([rows]) => {
                // Resolve question texts for fastest/slowest
                const qSet = new Set();
                rows.forEach(r => {
                    if (r.fastestQuestionId) qSet.add(Number(r.fastestQuestionId));
                    if (r.slowestQuestionId) qSet.add(Number(r.slowestQuestionId));
                });

                let qTextMap = {};
                if (qSet.size > 0) {
                    const qArr = Array.from(qSet);
                    const placeholders = qArr.map(() => '?').join(',');
                    const [qRows] = await dbPromise.query(`SELECT id, text FROM questions WHERE id IN (${placeholders})`, qArr);
                    qRows.forEach(qr => { qTextMap[qr.id] = qr.text; });
                }

                const processed = rows.map(r => ({
                    tagId: r.tagId,
                    tagName: r.tagName,
                    totalAttempts: Number(r.totalAttempts),
                    distinctQuestions: Number(r.distinctQuestions),
                    correctCount: Number(r.correctCount),
                    accuracy: r.accuracy !== null ? Number(r.accuracy) : 0,
                    avgTimeMs: r.avgTimeMs !== null ? Number(r.avgTimeMs) : null,
                    fastestTimeMs: r.fastestTimeMs !== null ? Number(r.fastestTimeMs) : null,
                    slowestTimeMs: r.slowestTimeMs !== null ? Number(r.slowestTimeMs) : null,
                    fastestQuestionText: r.fastestQuestionId ? (qTextMap[Number(r.fastestQuestionId)] || null) : null,
                    slowestQuestionText: r.slowestQuestionId ? (qTextMap[Number(r.slowestQuestionId)] || null) : null
                }));

                resolve(processed);
            })
            .catch((err) => reject(err));
    });
}

module.exports = {
    createBlankQuestion,
    updateQuestionField,
    deleteQuestion,
    createQuestionOption,
    updateQuestionOption,
    deleteQuestionOption,
    setCorrectOption,
    getQuestionsByUser,
    getQuestionWithOptions,
    getAllQuestions,
    getQuestionsByLecture,
    getQuestionsByTag,
    recordQuestionAttempt,
    getAttemptsForUser,
    getQuestionForStudent,
    getStudentAccessibleQuestions,
    getAttemptStatsForUser,
    getAttemptStatsForAllUsers,
    getAttemptStatsForAllQuestions,
    getAttemptStatsForAllTags,
    getAttemptStatsByTagForUser
}; 