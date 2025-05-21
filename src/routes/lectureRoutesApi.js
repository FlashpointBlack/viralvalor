const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Adjusted imports
const { setupMulter } = require('../../routesfunctions');
const { dbPromise } = require('../../db');
const {
  isUserAdminBySub,
  isUserEducatorBySub
} = require('../../utils/auth');
const {
  createBlankLecture,
  updateLecture,
  createLectureLink,
  createLectureFile,
  getLecturesForUser,
  getAllLectures,
  releaseLectureToAllStudents,
  getAccessibleLecturesForUser,
  submitLectureForApproval,
  approveLecture,
  denyLecture
} = require('../../lectureOperations');
const { getQuestionsByLecture } = require('../../questionOperations');
const { sendSystemDirectMessage } = require('../../messageOperations');
const {
  validateRequiredFields,
  isValidFieldName,
  handleErrorResponse,
  sanitizeValue
} = require('../../utils');

const dbQuery = dbPromise.query.bind(dbPromise);

const lectureUpload = setupMulter('public/lectures/uploads').single('file');

router.get('/my-lectures', async (req, res) => {
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isEducatorFlag = await isUserEducatorBySub(requestSub);
  if (!isAdminFlag && !isEducatorFlag) {
    return res.status(403).json({ error: 'Only educators or administrators can access lectures' });
  }

  try {
    const rows = isAdminFlag ? await getAllLectures() : await getLecturesForUser(requestSub);
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching lectures');
  }
});

router.post('/create-lecture-link', async (req, res) => {
  const { title, url, description = '' } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!title || !url) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: ['title', 'url'] });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isEducatorFlag = await isUserEducatorBySub(requestSub);
  if (!isAdminFlag && !isEducatorFlag) {
    return res.status(403).json({ error: 'Only educators or administrators can create lectures' });
  }

  createLectureLink(title, url, requestSub, description)
    .then((lectureId) => res.status(200).json({ lectureId }))
    .catch((err) => handleErrorResponse(err, res, 'Error creating lecture link'));
});

router.post('/create-blank-lecture', async (req, res) => {
  const { userSub, title = 'Untitled Lecture', description = '' } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!userSub) {
    return res.status(400).json({ error: 'Missing required fields', missingFields: ['userSub'] });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  if (userSub !== requestSub) {
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (!isAdminFlag) {
      return res.status(403).json({ error: 'You can only create lectures for yourself' });
    }
  }

  const isAdminFlag2 = await isUserAdminBySub(requestSub);
  const isEducatorFlag2 = await isUserEducatorBySub(requestSub);
  if (!isAdminFlag2 && !isEducatorFlag2) {
    return res.status(403).json({ error: 'Only educators or administrators can create lectures' });
  }

  createBlankLecture(userSub, title, description)
    .then((lectureId) => res.status(200).json({ lectureId }))
    .catch((err) => handleErrorResponse(err, res, 'Error creating lecture'));
});

router.post('/upload-lecture-file', lectureUpload, async (req, res) => {
  const { title, description = '' } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!title) {
    return res.status(400).json({ error: 'Missing required field', missingFields: ['title'] });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  const isEducatorFlag = await isUserEducatorBySub(requestSub);
  if (!isAdminFlag && !isEducatorFlag) {
    return res.status(403).json({ error: 'Only educators or administrators can upload lectures' });
  }

  const { filename, originalname } = req.file;

  createLectureFile(title, filename, originalname, requestSub, description)
    .then((lectureId) => res.status(200).json({ lectureId }))
    .catch((err) => handleErrorResponse(err, res, 'Error uploading lecture file'));
});

router.post('/upload-lecture-file-existing', lectureUpload, async (req, res) => {
  const { id } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!id) return res.status(400).json({ error: 'Missing lecture id' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await dbQuery('SELECT createdBy FROM lectures WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Lecture not found' });
    }
    const isOwner = rows[0].createdBy === requestSub;
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (!isOwner && !isAdminFlag) {
      return res.status(403).json({ error: 'You do not have permission to edit this lecture' });
    }

    const { filename, originalname } = req.file;
    await dbQuery(
      'UPDATE lectures SET fileNameServer = ?, originalName = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [filename, originalname, id]
    );

    res.status(200).json({ message: 'File uploaded' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error uploading lecture file');
  }
});

router.get('/download-lecture-file/:id', async (req, res) => {
  const lectureId = req.params.id;
  try {
    const rows = await dbQuery('SELECT title, fileNameServer, originalName FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
    if (!rows || rows.length === 0) {
      return res.status(404).send('Lecture not found');
    }

    const { title, fileNameServer, originalName } = rows[0];
    if (!fileNameServer) {
      return res.status(400).send('Lecture does not have an uploaded file');
    }

    const filePath = path.join(__dirname, '../../public/lectures/uploads', fileNameServer);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found at path: ${filePath}`);
      return res.status(404).send('File not found on server');
    }

    const ext = path.extname(originalName || '') || path.extname(fileNameServer) || '.pptx';

    let safeTitle = (title || 'lecture').toString().replace(/[^a-z0-9\-_]/gi, '_');
    if (!safeTitle) safeTitle = 'lecture';

    const downloadName = `${safeTitle}${ext}`;
    return res.download(filePath, downloadName);
  } catch (err) {
    handleErrorResponse(err, res, 'Error downloading lecture file');
  }
});

router.post('/delete-lecture-file', async (req, res) => {
  const { id } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!id) return res.status(400).json({ error: 'Missing lecture id' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await dbQuery('SELECT createdBy, fileNameServer FROM lectures WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Lecture not found' });

    const { createdBy, fileNameServer } = rows[0];
    if (!fileNameServer) return res.status(400).json({ error: 'No file to delete' });

    const isOwner = createdBy === requestSub;
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (!isOwner && !isAdminFlag) return res.status(403).json({ error: 'Forbidden' });

    try {
      const p = path.join(__dirname, '../../public/lectures/uploads', fileNameServer);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {
      console.warn(`Failed to delete file ${fileNameServer} during lecture file deletion, continuing.`);
    }

    await dbQuery('UPDATE lectures SET fileNameServer = NULL, originalName = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return res.status(200).json({ message: 'File deleted' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error deleting lecture file');
  }
});

router.post('/delete-lecture', async (req, res) => {
  const { id } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!id) return res.status(400).json({ error: 'Missing lecture id' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await dbQuery('SELECT createdBy, fileNameServer FROM lectures WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Lecture not found' });

    const { createdBy, fileNameServer } = rows[0];
    const isOwner = createdBy === requestSub;
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (!isOwner && !isAdminFlag) {
      return res.status(403).json({ error: 'You do not have permission to delete this lecture' });
    }

    try {
      await dbQuery('DELETE FROM lecture_access WHERE lectureId = ?', [id]);
    } catch (accessErr) {
      console.warn('[delete-lecture] Non-blocking lecture_access cleanup error:', accessErr.message);
    }

    const qRows = await dbQuery('SELECT id FROM questions WHERE lectureId = ?', [id]);
    if (qRows && qRows.length) {
      const questionIds = qRows.map((r) => r.id);
      const placeholders = questionIds.map(() => '?').join(',');
      if (placeholders) {
        await dbQuery(`DELETE FROM question_attempts WHERE questionId IN (${placeholders})`, questionIds);
        await dbQuery(`DELETE FROM question_tags WHERE questionId IN (${placeholders})`, questionIds);
        await dbQuery(`DELETE FROM questions WHERE id IN (${placeholders})`, questionIds);
      }
    }

    await dbQuery('DELETE FROM lectures WHERE id = ?', [id]);

    if (fileNameServer) {
      const filePath = path.join(__dirname, '../../public/lectures/uploads', fileNameServer);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {
          console.warn(`Failed to delete file ${fileNameServer} during lecture deletion, continuing.`);
        }
      }
    }

    res.json({ message: 'Lecture deleted' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error deleting lecture');
  }
});

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

router.post('/update-lecture', async (req, res) => {
  const { id, title, description, url } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!id) return res.status(400).json({ error: 'Missing lecture id' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await dbQuery('SELECT createdBy FROM lectures WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const isOwner = rows[0].createdBy === requestSub;
    const isAdminFlag = await isUserAdminBySub(requestSub);
    if (!isOwner && !isAdminFlag) {
      return res.status(403).json({ error: 'You do not have permission to edit this lecture' });
    }

    const updateFields = {};
    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (url !== undefined) updateFields.linkUrl = url;

    await updateLecture(id, updateFields);
    res.status(200).json({ message: 'Lecture updated' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error updating lecture');
  }
});

router.post('/release-lecture', async (req, res) => {
  const { lectureId } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can release lectures' });

  try {
    const rows = await dbQuery('SELECT approvalStatus FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Lecture not found' });
    if (rows[0].approvalStatus !== 'APPROVED') {
      return res.status(400).json({ error: 'Lecture must be approved before release' });
    }

    const count = await releaseLectureToAllStudents(lectureId);

    try {
      const [lectRow] = await dbQuery('SELECT title FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
      const title = lectRow?.title || 'New lecture';
      const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const lectureLink = `${baseUrl}/?tab=mylectures`;
      const body = `A new lecture assignment "${title}" has been added to your account. You can view it <a href="${lectureLink}">here</a>.`;

      const students = await dbQuery(
        'SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)'
      );
      if (students && students.length) {
        const io = req.app.get('io');
        await Promise.all(
          students.map((u) => sendSystemDirectMessage(u.auth0_sub, body, io).catch(() => {}))
        );
      }
    } catch (notifyErr) {
      console.error('Failed to send lecture release notifications:', notifyErr);
    }

    res.json({ releasedCount: count });
  } catch (err) {
    handleErrorResponse(err, res, 'Error releasing lecture');
  }
});

router.get('/my-released-lectures', async (req, res) => {
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const rows = await getAccessibleLecturesForUser(requestSub);
    res.json(rows);
  } catch (err) {
    handleErrorResponse(err, res, 'Error fetching accessible lectures');
  }
});

router.post('/submit-lecture-for-approval', async (req, res) => {
  const { lectureId } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await submitLectureForApproval(lectureId, requestSub);
    res.json({ message: 'Lecture submitted for approval' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error submitting lecture');
  }
});

router.post('/approve-lecture', async (req, res) => {
  const { lectureId } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can approve lectures' });

  try {
    await approveLecture(lectureId, requestSub);

    try {
      const rows = await dbQuery('SELECT createdBy, title FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
      if (rows && rows.length) {
        const { createdBy, title } = rows[0];
        if (createdBy) {
          const body = `Your lecture "${title}" has been approved by an administrator.`;
          const io = req.app.get('io');
          await sendSystemDirectMessage(createdBy, body, io);
        }
      }
    } catch (notifyErr) {
      console.error('Failed to send approval notification:', notifyErr);
    }

    res.json({ message: 'Lecture approved' });
  } catch (err) {
    const msg = err?.message || 'Error approving lecture';
    return res.status(400).json({ error: msg });
  }
});

router.post('/deny-lecture', async (req, res) => {
  const { lectureId } = req.body;
  const requestSub = (req.oidc?.user?.sub) || req.headers['x-user-sub'];

  if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

  const isAdminFlag = await isUserAdminBySub(requestSub);
  if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can deny lectures' });

  try {
    const { createdBy, title } = await denyLecture(lectureId, requestSub);

    if (createdBy) {
      try {
        const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const editLink = `${baseUrl}/?tab=lecture-edit&lecture=${lectureId}`;
        const body = `Your lecture "${title}" was denied by an administrator and has been moved back to draft. You can edit it <a href="${editLink}">here</a>.`;

        const io = req.app.get('io');
        await sendSystemDirectMessage(createdBy, body, io);
      } catch (notifyErr) {
        console.error('Failed to send denial notification:', notifyErr);
      }
    }

    res.json({ message: 'Lecture denied and moved back to draft' });
  } catch (err) {
    handleErrorResponse(err, res, 'Error denying lecture');
  }
});

router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'lectures' }));

module.exports = router; 