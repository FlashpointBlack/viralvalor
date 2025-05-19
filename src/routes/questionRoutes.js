const express = require('express');

// ---------------------------------------------------------------------------
//  Question Bank Routes – INITIAL STUBS (M4)
//  These handlers currently return HTTP 501 as the real logic is migrated
//  out of the legacy bundle.  See /cursornotes/plan_M4_questionRoutes.md.
// ---------------------------------------------------------------------------

const router = express.Router();

// Helper to quickly register stub endpoints
function addStub(method, path) {
  router[method](path, (_req, res) => {
    res.status(501).json({ error: 'Not implemented – M4 in progress' });
  });
}

// ---------------- REAL ENDPOINTS (READ-ONLY) -----------------------------
// M4 – step-03: migrate all GET endpoints from legacy routes.js without
// changing their behaviour.  POST / PUT / DELETE remain stubbed.
// -------------------------------------------------------------------------

// External dependencies (pulled from original routes.js)
const {
  getQuestionsByUser,
  getQuestionWithOptions,
  getAllQuestions,
  getQuestionsByLecture,
  getQuestionsByTag,
  getStudentAccessibleQuestions,
  getQuestionForStudent,
  getAttemptsForUser,
  getAttemptStatsForUser,
  getAttemptStatsForAllUsers,
  getAttemptStatsForAllQuestions,
  getAttemptStatsForAllTags,
  getAttemptStatsByTagForUser,
  // --- mutating helpers ---
  createBlankQuestion,
  updateQuestionField,
  deleteQuestion,
  createQuestionOption,
  updateQuestionOption,
  deleteQuestionOption,
  setCorrectOption,
  recordQuestionAttempt,
} = require('../../questionOperations');
const { isUserAdminBySub, isUserEducatorBySub } = require('../../utils/auth');
const {
  handleErrorResponse,
  validateRequiredFields,
  sanitizeValue,
  isValidFieldName,
} = require('../../utils');
const { setQuestionTags } = require('../../tagOperations');
const { dbPromise } = require('../../db');

// ---------------------------------------------------------------------
// Helper: evaluate request sub from either Auth0 session or header.
function getRequestSub(req) {
  return (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
}

// Helper: check if current user owns question
async function isQuestionOwner(questionId, userSub) {
  if (!userSub) return false;
  try {
    const [rows] = await dbPromise.query('SELECT createdBy FROM questions WHERE id = ? LIMIT 1', [questionId]);
    return rows.length > 0 && rows[0].createdBy === userSub;
  } catch (err) {
    console.error('isQuestionOwner DB error', err);
    return false;
  }
}

// 1) /my-questions – list questions owned by the user (admins see all)
router.get('/my-questions', async (req, res) => {
  const requestSub = getRequestSub(req);
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (isAdminFlag) {
      const rows = await getAllQuestions();
      return res.json(rows);
    }
    const rows = await getQuestionsByUser(requestSub);
    return res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching questions.');
  }
});

// 2) /get-question/:id – full question with options (owner or admin only)
router.get('/get-question/:id', async (req, res) => {
  const questionId = req.params.id;
  const requestSub = getRequestSub(req);
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const question = await getQuestionWithOptions(questionId);
    const isAdminFlag = await isUserAdminBySub(requestSub);
    const isOwnerFlag = question._REC_Creation_User === requestSub;
    if (!isAdminFlag && !isOwnerFlag) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(question);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching question.');
  }
});

// 3) /questions-by-tag/:tagId – admin-level filter across question bank
router.get('/questions-by-tag/:tagId', async (req, res) => {
  const { tagId } = req.params;
  try {
    const rows = await getQuestionsByTag(tagId);
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching questions by tag');
  }
});

// 4) /student-questions – list available questions for student practice
router.get('/student-questions', async (req, res) => {
  const requestSub = getRequestSub(req);
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const rows = await getStudentAccessibleQuestions(requestSub);
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching questions');
  }
});

// 5) /student-question/:id – single question for answering (no correct flags)
router.get('/student-question/:id', async (req, res) => {
  const questionId = req.params.id;
  try {
    const question = await getQuestionForStudent(questionId);
    res.json(question);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching question');
  }
});

// 6) /my-question-attempts – attempts for current user (optionally filter by question)
router.get('/my-question-attempts', async (req, res) => {
  const userSub = getRequestSub(req);
  if (!userSub) return res.status(401).json({ error: 'Unauthorized' });
  const questionId = req.query.questionId || null;
  try {
    const attempts = await getAttemptsForUser(userSub, questionId);
    res.json(attempts);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching attempts');
  }
});

// 7) /my-question-stats – aggregate stats for current user
router.get('/my-question-stats', async (req, res) => {
  const userSub = getRequestSub(req);
  if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

  const { startDate, endDate } = req.query;
  try {
    const stats = await getAttemptStatsForUser(userSub, startDate || null, endDate || null);
    res.json(stats);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching attempt stats');
  }
});

// 8) /admin/question-stats – aggregate across all users (admin only)
router.get('/admin/question-stats', async (req, res) => {
  const requestSub = getRequestSub(req);
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can access this endpoint' });

  const { startDate, endDate } = req.query;
  try {
    const stats = await getAttemptStatsForAllUsers(startDate || null, endDate || null);
    res.json(stats);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching all user attempt stats');
  }
});

// 9) /admin/question-stats-by-question – aggregate across questions (admin only)
router.get('/admin/question-stats-by-question', async (req, res) => {
  const requestSub = getRequestSub(req);
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can access this endpoint' });

  const { startDate, endDate } = req.query;
  try {
    const stats = await getAttemptStatsForAllQuestions(startDate || null, endDate || null);
    res.json(stats);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching question attempt stats');
  }
});

// 10) /admin/question-stats-by-tag – aggregate across tags OR by student (admin only)
router.get('/admin/question-stats-by-tag', async (req, res) => {
  const requestSub = getRequestSub(req);
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can access this endpoint' });

  const { startDate, endDate, studentSub } = req.query;
  try {
    let stats;
    if (studentSub) {
      stats = await getAttemptStatsByTagForUser(studentSub, startDate || null, endDate || null);
    } else {
      stats = await getAttemptStatsForAllTags(startDate || null, endDate || null);
    }
    res.json(stats);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching tag attempt stats');
  }
});

// 11) /lecture/:lectureId/questions – fetch questions for a lecture (optional tag filter)
router.get('/lecture/:lectureId/questions', async (req, res) => {
  const { lectureId } = req.params;
  const tagId = req.query.tagId || null;
  try {
    const rows = await getQuestionsByLecture(lectureId, tagId);
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching questions for lecture');
  }
});

// 12) /my-question-stats-by-tag – aggregate tag stats for current user
router.get('/my-question-stats-by-tag', async (req, res) => {
  const userSub = getRequestSub(req);
  if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

  const { startDate, endDate } = req.query;
  try {
    const stats = await getAttemptStatsByTagForUser(userSub, startDate || null, endDate || null);
    res.json(stats);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching tag attempt stats for user');
  }
});

// ---------------- MUTATING ENDPOINTS (POST) ------------------------------
// 1) Create blank question
router.post('/create-blank-question', async (req, res) => {
  const { userSub, lectureId = null } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['userSub']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isEducatorFlag = await isUserEducatorBySub(requestSub);
  if (!isAdminFlag && !isEducatorFlag) {
    return res.status(403).json({ error: 'Only educators or administrators can create questions' });
  }
  if (userSub !== requestSub && !isAdminFlag) {
    return res.status(403).json({ error: 'You can only create questions for yourself' });
  }
  try {
    const questionId = await createBlankQuestion(userSub, lectureId);
    res.status(200).json({ questionId });
  } catch (err) {
    handleErrorResponse(err, res, 'Error creating blank question.');
  }
});

// 2) Update question field
router.post('/update-question-field', async (req, res) => {
  const { id, field, value } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isQuestionOwner(id, requestSub);
  if (!isAdminFlag && !isOwnerFlag) {
    return res.status(403).json({ error: 'You do not have permission to edit this question' });
  }
  if (!isValidFieldName(field)) {
    return res.status(400).json({ error: 'Invalid field name' });
  }
  const sanitizedValue = sanitizeValue(value);
  try {
    await updateQuestionField(id, field, sanitizedValue);
    res.status(200).json({ message: 'Field updated successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error updating question field.');
  }
});

// 3) Delete question
router.post('/delete-question', async (req, res) => {
  const { id } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['id']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isQuestionOwner(id, requestSub);
  if (!isAdminFlag && !isOwnerFlag) {
    return res.status(403).json({ error: 'You do not have permission to delete this question' });
  }
  try {
    await deleteQuestion(id);
    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error deleting question.');
  }
});

// 4) Create question option (adds blank option)
router.post('/create-question-option', async (req, res) => {
  const { questionId, userSub } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['questionId', 'userSub']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
  if (!isAdminFlag && !isOwnerFlag) {
    return res.status(403).json({ error: 'You do not have permission to add options' });
  }
  try {
    const optionId = await createQuestionOption(questionId, userSub);
    res.status(200).json({ optionId });
  } catch (err) {
    handleErrorResponse(err, res, 'Error creating option.');
  }
});

// 5) Update question option text
router.post('/update-question-option', async (req, res) => {
  const { questionId, optionId, text, rationale } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['questionId', 'optionId']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
  if (!isAdminFlag && !isOwnerFlag) {
    return res.status(403).json({ error: 'You do not have permission to edit options' });
  }
  try {
    await updateQuestionOption(
      optionId,
      text !== undefined ? sanitizeValue(text) : undefined,
      rationale !== undefined ? sanitizeValue(rationale) : undefined,
      questionId,
    );
    res.status(200).json({ message: 'Option updated successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error updating option.');
  }
});

// 6) Delete question option
router.post('/delete-question-option', async (req, res) => {
  const { questionId, optionId } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['questionId', 'optionId']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
  if (!isAdminFlag && !isOwnerFlag) {
    return res.status(403).json({ error: 'You do not have permission to delete options' });
  }
  try {
    await deleteQuestionOption(optionId);
    res.status(200).json({ message: 'Option deleted successfully' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error deleting option.');
  }
});

// 7) Set correct option
router.post('/set-correct-option', async (req, res) => {
  const { questionId, optionId } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['questionId', 'optionId']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
  if (!isAdminFlag && !isOwnerFlag) {
    return res.status(403).json({ error: 'You do not have permission to modify this question' });
  }
  try {
    await setCorrectOption(questionId, optionId);
    res.status(200).json({ message: 'Correct option set' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error setting correct option.');
  }
});

// 8) Set tags for a question (replace)
router.post('/set-question-tags', async (req, res) => {
  const { questionId, tagIds } = req.body;
  const requestSub = getRequestSub(req);
  const validation = validateRequiredFields(req.body, ['questionId', 'tagIds']);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
  }
  if (!Array.isArray(tagIds)) {
    return res.status(400).json({ error: 'tagIds must be an array' });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
  if (!isAdminFlag && !isOwnerFlag) {
    return res.status(403).json({ error: 'You do not have permission to edit tags for this question' });
  }
  try {
    await setQuestionTags(questionId, tagIds);
    res.status(200).json({ message: 'Tags updated' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error setting tags.');
  }
});

// 9) Record student attempt
router.post('/record-question-attempt', async (req, res) => {
  const { questionId, selectedOptionId, timeTakenMs } = req.body;
  const userSub = getRequestSub(req);
  if (!userSub) return res.status(401).json({ error: 'Unauthorized' });
  if (!questionId || selectedOptionId === undefined || selectedOptionId === null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await recordQuestionAttempt(questionId, userSub, selectedOptionId, timeTakenMs);
    res.status(200).json(result);
  } catch (err) {
    handleErrorResponse(err, res, 'Error recording attempt');
  }
});

// -------------------------------------------------------------------------
// Health probe – kept at bottom so it never conflicts with real endpoints.
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'question-bank' }));

module.exports = router; 