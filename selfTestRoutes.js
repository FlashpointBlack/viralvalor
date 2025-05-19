const express = require('express');
const router = express.Router();

const { dbPromise } = require('./db');
const journalOps = require('./journalOperations');
const lectureOps = require('./lectureOperations');
const questionOps = require('./questionOperations');
const articleOps = require('./articleOperations');
const { BadgeUploadHandler, CharacterUploadHandler, BackdropUploadHandler, InstructionUploadHandler, ProfileUploadHandler, EncounterUploadHandler } = require('./imageHandlers');
const fs = require('fs');
const path = require('path');
const { isUserAdminBySub } = require('./utils/auth');
const supertest = require('supertest');
const { setupLectureRoutes } = require('./lectureRoutes');

// Runs all operation-level integration tests and returns a structured result object
async function runOpsSelfTest(userSub) {
  const results = [];
  const ts = Date.now();

  /* ---------- Migration Completeness (dbPromise) ---------- */
  const migrateRes = { name: 'dbPromise Migration Scan', steps: [] };
  try {
    const projectRoot = path.resolve(__dirname);
    const pendingFiles = [projectRoot];
    const offenders = [];

    while (pendingFiles.length) {
      const p = pendingFiles.pop();
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        const dirName = path.basename(p);
        // Skip node_modules, version control and temp dirs
        if (['node_modules', '.git', 'tmp_selftest_badges', '.cursor'].includes(dirName)) continue;
        fs.readdirSync(p).forEach(f => pendingFiles.push(path.join(p, f)));
      } else if (stat.isFile() && p.endsWith('.js')) {
        // Ignore selfTestRoutes.js itself to prevent false positives (contains the search string in code)
        if (p.endsWith('selfTestRoutes.js')) continue;
        const txt = fs.readFileSync(p, 'utf8');
        if (txt.includes('db.query(')) {
          offenders.push(path.relative(projectRoot, p));
        }
      }
    }

    migrateRes.steps.push({
      name: 'Scan for legacy db.query usages',
      ok: offenders.length === 0,
      error: offenders.length ? offenders.join(', ') : undefined,
      sample: 'All *.js files',
      id: offenders.length
    });
  } catch (err) {
    migrateRes.steps.push({ name: 'Scan error', ok: false, error: err.message });
  }
  results.push(migrateRes);

  /* ---------- Journal Operations tests ---------- */
  const journalRes = { name: 'Journal Operations', steps: [] };
  let promptId;
  try {
    promptId = await journalOps.createJournalPrompt(`SELFTEST_${ts}`, 'Self-test prompt text', userSub);
    journalRes.steps.push({ name: 'Create prompt', ok: !!promptId, sample: `SELFTEST_${ts}`, id: promptId });

    await journalOps.updateJournalPrompt(promptId, { title: 'Updated title' });
    journalRes.steps.push({ name: 'Update prompt', ok: true, sample: 'Updated title', id: promptId });

    const prompt = await journalOps.getJournalPrompt(promptId);
    journalRes.steps.push({ name: 'Fetch prompt', ok: prompt && prompt.title === 'Updated title', sample: prompt && prompt.title, id: promptId });

    const charCount = await journalOps.upsertJournalResponse(promptId, userSub, 'Sample response');
    journalRes.steps.push({ name: 'Upsert response', ok: charCount === 'Sample response'.length, sample: 'Sample response', id: promptId });

    const resp = await journalOps.getJournalResponse(promptId, userSub);
    journalRes.steps.push({ name: 'Fetch response', ok: resp && resp.responseText === 'Sample response', sample: resp && resp.responseText, id: promptId });
  } catch (err) {
    journalRes.steps.push({ name: 'Error', ok: false, error: err.message });
  } finally {
    if (promptId) {
      try { await journalOps.deleteJournalPrompt(promptId); } catch (_) { /* ignore */ }
    }
  }
  results.push(journalRes);

  /* ---------- Lecture Operations tests ---------- */
  const lectureRes = { name: 'Lecture Operations', steps: [] };
  let lectId;
  try {
    // 1. Create blank lecture
    lectId = await lectureOps.createBlankLecture(userSub, `SELFTEST_${ts}`, 'Self-test lecture');
    lectureRes.steps.push({ name: 'Create blank lecture', ok: !!lectId, sample: 'SELFTEST', id: lectId });

    // 2. Update lecture title
    await lectureOps.updateLecture(lectId, { title: 'Updated SELFTEST' });
    lectureRes.steps.push({ name: 'Update lecture', ok: true, sample: 'Updated SELFTEST', id: lectId });

    // 3. Fetch via helper to ensure update persisted
    const [rows] = await dbPromise.query('SELECT title FROM lectures WHERE id = ?', [lectId]);
    lectureRes.steps.push({ name: 'Fetch lecture', ok: rows.length === 1 && rows[0].title === 'Updated SELFTEST', sample: rows[0] && rows[0].title, id: lectId });
  } catch (err) {
    lectureRes.steps.push({ name: 'Error', ok: false, error: err.message });
  } finally {
    if (lectId) {
      try { await dbPromise.query('DELETE FROM lectures WHERE id = ?', [lectId]); } catch (_) { /* ignore */ }
      lectureRes.steps.push({ name: 'Delete lecture', ok: true, id: lectId });
    }
  }
  results.push(lectureRes);

  /* ---------- Lecture Routes (HTTP) ---------- */
  const lectureHttpRes = { name: 'Lecture Routes (HTTP)', steps: [] };
  let httpLectureId; let testUserSub;
  try {
    const testApp = express();
    testApp.use(express.json({ limit: '5mb' }));
    setupLectureRoutes(testApp);

    const request = supertest(testApp);

    // Create a temporary educator user for auth
    testUserSub = `SELFTEST_HTTP_${ts}`;
    await dbPromise.query(
      'INSERT INTO UserAccounts (auth0_sub, email, iseducator, creation_date) VALUES (?, ?, 1, NOW())',
      [testUserSub, `${testUserSub}@example.com`]
    );
    lectureHttpRes.steps.push({ name: 'Create educator user', ok: true, sample: testUserSub, id: testUserSub });

    // Create blank lecture via HTTP route
    const createRes = await request
      .post('/create-blank-lecture')
      .set('x-user-sub', testUserSub)
      .send({ userSub: testUserSub, title: 'SelfTest Lecture', description: 'via HTTP' });

    httpLectureId = createRes.body && createRes.body.lectureId;
    lectureHttpRes.steps.push({ name: 'POST create-blank-lecture', ok: createRes.status === 200 && !!httpLectureId, sample: httpLectureId, id: httpLectureId });

    // Verify lecture appears in the user list
    const listRes = await request.get('/my-lectures').set('x-user-sub', testUserSub);
    const found = Array.isArray(listRes.body) && listRes.body.some((row) => row.id === httpLectureId);
    lectureHttpRes.steps.push({ name: 'GET my-lectures', ok: listRes.status === 200 && found, sample: listRes.body && listRes.body.length, id: httpLectureId });

    // Delete lecture via route
    const delRes = await request.post('/delete-lecture').set('x-user-sub', testUserSub).send({ id: httpLectureId });
    lectureHttpRes.steps.push({ name: 'POST delete-lecture', ok: delRes.status === 200, id: httpLectureId });
  } catch (err) {
    lectureHttpRes.steps.push({ name: 'HTTP route tests error', ok: false, error: err.message });
  } finally {
    if (httpLectureId) {
      try { await dbPromise.query('DELETE FROM lectures WHERE id = ?', [httpLectureId]); } catch (_) {}
    }
    if (testUserSub) {
      try { await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [testUserSub]); } catch (_) {}
    }
  }
  results.push(lectureHttpRes);

  /* ---------- Encounter Routes (HTTP) ---------- */
  const encounterHttpRes = { name: 'Encounter Routes (HTTP)', steps: [] };
  let encounterId; let choiceId; let duplicateId;
  try {
    const encApp = express();
    encApp.use(express.json({ limit: '5mb' }));

    // Mount encounter router at root for tests
    const encounterRouter = require('./src/routes/encounterRoutes');
    encApp.use('/', encounterRouter);

    const encRequest = supertest(encApp);

    // Health check for encounter service
    const encHealthRes = await encRequest.get('/health');
    encounterHttpRes.steps.push({
      name: 'GET /health',
      ok: encHealthRes.status === 200 && encHealthRes.body && encHealthRes.body.status === 'ok',
      sample: encHealthRes.body && encHealthRes.body.service,
      id: 0
    });

    // Dedicated user sub for this block
    const encSub = `SELFTEST_ENC_${ts}`;

    // 1. Create blank encounter
    const createRes = await encRequest
      .post('/create-blank-encounter')
      .set('x-user-sub', encSub)
      .send({ userSub: encSub });
    encounterId = createRes.body && createRes.body.encounterId;
    encounterHttpRes.steps.push({ name: 'POST create-blank-encounter', ok: createRes.status === 200 && !!encounterId, sample: encounterId, id: encounterId });

    // 2. Update encounter title
    const updRes = await encRequest
      .post('/update-encounter-field')
      .set('x-user-sub', encSub)
      .send({ id: encounterId, field: 'Title', value: 'SELFTEST_TITLE' });
    encounterHttpRes.steps.push({ name: 'POST update-encounter-field', ok: updRes.status === 200, id: encounterId });

    // 3. Fetch encounter data
    const getRes = await encRequest
      .get(`/GetEncounterData/${encounterId}`)
      .set('x-user-sub', encSub);
    const getOk = getRes.status === 200 && getRes.body && getRes.body.Encounter && Number(getRes.body.Encounter.ID) === Number(encounterId);
    encounterHttpRes.steps.push({ name: 'GET GetEncounterData', ok: getOk, sample: getRes.body && getRes.body.Encounter && getRes.body.Encounter.Title, id: encounterId });

    // 4. Create encounter choice
    const choiceRes = await encRequest
      .post('/create-encounter-choice')
      .set('x-user-sub', encSub)
      .send({ EncounterID: encounterId, UserSub: encSub });
    choiceId = choiceRes.body && choiceRes.body.ID;
    encounterHttpRes.steps.push({ name: 'POST create-encounter-choice', ok: choiceRes.status === 200 && !!choiceId, id: choiceId });

    // 5. Duplicate encounter
    const dupRes = await encRequest
      .post('/duplicateEncounter')
      .set('x-user-sub', encSub)
      .send({ encounterId: encounterId, userSub: encSub });
    duplicateId = dupRes.body && dupRes.body.newEncounterId;
    encounterHttpRes.steps.push({ name: 'POST duplicateEncounter', ok: dupRes.status === 200 && !!duplicateId, id: duplicateId });

    // 6. Update encounter choice title
    const updChoiceRes = await encRequest
      .post('/update-encounter-choice')
      .set('x-user-sub', encSub)
      .send({ ID: choiceId, Title: 'Option SelfTest' });
    encounterHttpRes.steps.push({ name: 'POST update-encounter-choice', ok: updChoiceRes.status === 200, id: choiceId });

    // 7. Set receiving encounter
    const setRecvRes = await encRequest
      .post('/set-receiving-encounter')
      .set('x-user-sub', encSub)
      .send({ RouteID: choiceId, selectedEncounterID: duplicateId });
    encounterHttpRes.steps.push({ name: 'POST set-receiving-encounter', ok: setRecvRes.status === 200, id: choiceId });

    // 8. GET /unlinked-encounters
    const unlinkedRes = await encRequest.get('/unlinked-encounters');
    encounterHttpRes.steps.push({ name: 'GET unlinked-encounters', ok: unlinkedRes.status === 200, sample: Array.isArray(unlinkedRes.body) ? unlinkedRes.body.length : 'err', id: (unlinkedRes.body && unlinkedRes.body.length) || 0 });

    // 9. GET /root-encounters
    const rootRes = await encRequest.get('/root-encounters').set('x-user-sub', encSub);
    const rootFound = Array.isArray(rootRes.body) && rootRes.body.some((row) => row.ID === encounterId);
    encounterHttpRes.steps.push({ name: 'GET root-encounters', ok: rootRes.status === 200 && rootFound, sample: rootRes.body && rootRes.body.length, id: rootRes.body && rootRes.body.length });

    // 10. Delete encounter choice
    const delChoiceRes = await encRequest
      .post('/delete-encounter-choice')
      .set('x-user-sub', encSub)
      .send({ ID: choiceId });
    encounterHttpRes.steps.push({ name: 'POST delete-encounter-choice', ok: delChoiceRes.status === 200, id: choiceId });

    // 11. Delete root encounter (also purges duplicate & routes)
    const delRootRes = await encRequest
      .post('/delete-root-encounter')
      .set('x-user-sub', encSub)
      .send({ rootEncounterId: encounterId });
    encounterHttpRes.steps.push({ name: 'POST delete-root-encounter', ok: delRootRes.status === 200, id: encounterId });
  } catch (err) {
    encounterHttpRes.steps.push({ name: 'Encounter HTTP tests error', ok: false, error: err.message });
  }
  results.push(encounterHttpRes);

  /* ---------- Question Routes (HTTP) ---------- */
  const questionHttpRes = { name: 'Question Routes (HTTP)', steps: [] };
  let httpQId; let httpOptId; let qEducatorSub; let qStudentSub;
  try {
    const qApp = express();
    qApp.use(express.json({ limit: '5mb' }));

    // Mount question router at root for isolated testing
    const questionRouter = require('./src/routes/questionRoutes');
    qApp.use('/', questionRouter);

    const qRequest = supertest(qApp);

    // Create temporary educator & student users
    qEducatorSub = `SELFTEST_Q_EDU_${ts}`;
    qStudentSub  = `SELFTEST_Q_STU_${ts}`;

    await dbPromise.query(
      'INSERT INTO UserAccounts (auth0_sub, email, iseducator, creation_date) VALUES (?, ?, 1, NOW())',
      [qEducatorSub, `${qEducatorSub}@example.com`]
    );
    await dbPromise.query(
      'INSERT INTO UserAccounts (auth0_sub, email, creation_date) VALUES (?, ?, NOW())',
      [qStudentSub, `${qStudentSub}@example.com`]
    );
    questionHttpRes.steps.push({ name: 'Create temp users', ok: true, sample: `${qEducatorSub}, ${qStudentSub}` });

    // 1. Create blank question
    const createQRes = await qRequest
      .post('/create-blank-question')
      .set('x-user-sub', qEducatorSub)
      .send({ userSub: qEducatorSub });

    httpQId = createQRes.body && createQRes.body.questionId;
    questionHttpRes.steps.push({ name: 'POST create-blank-question', ok: createQRes.status === 200 && !!httpQId, id: httpQId });

    // 2. Update question text
    const updQRes = await qRequest
      .post('/update-question-field')
      .set('x-user-sub', qEducatorSub)
      .send({ id: httpQId, field: 'QuestionText', value: 'HTTP Self-test question?' });
    questionHttpRes.steps.push({ name: 'POST update-question-field', ok: updQRes.status === 200, id: httpQId });

    // 3. Create blank option
    const optRes = await qRequest
      .post('/create-question-option')
      .set('x-user-sub', qEducatorSub)
      .send({ questionId: httpQId, userSub: qEducatorSub });
    httpOptId = optRes.body && optRes.body.optionId;
    questionHttpRes.steps.push({ name: 'POST create-question-option', ok: optRes.status === 200 && !!httpOptId, id: httpOptId });

    // 4. Update option text & rationale
    const updOptRes = await qRequest
      .post('/update-question-option')
      .set('x-user-sub', qEducatorSub)
      .send({ questionId: httpQId, optionId: httpOptId, text: 'Option A', rationale: 'Sample rationale' });
    questionHttpRes.steps.push({ name: 'POST update-question-option', ok: updOptRes.status === 200, id: httpOptId });

    // 5. Set correct option
    const setCorrRes = await qRequest
      .post('/set-correct-option')
      .set('x-user-sub', qEducatorSub)
      .send({ questionId: httpQId, optionId: httpOptId });
    questionHttpRes.steps.push({ name: 'POST set-correct-option', ok: setCorrRes.status === 200, id: httpOptId });

    // 6. GET my-questions list
    const listQRes = await qRequest
      .get('/my-questions')
      .set('x-user-sub', qEducatorSub);
    const listFound = Array.isArray(listQRes.body) && listQRes.body.some((q) => q.ID === httpQId);
    questionHttpRes.steps.push({ name: 'GET my-questions', ok: listQRes.status === 200 && listFound, sample: listQRes.body && listQRes.body.length, id: httpQId });

    // 7. GET get-question/:id
    const getQRes = await qRequest
      .get(`/get-question/${httpQId}`)
      .set('x-user-sub', qEducatorSub);
    questionHttpRes.steps.push({ name: 'GET get-question/:id', ok: getQRes.status === 200 && getQRes.body && getQRes.body.ID === httpQId, id: httpQId });

    // 8. Record attempt as student
    const recAttRes = await qRequest
      .post('/record-question-attempt')
      .set('x-user-sub', qStudentSub)
      .send({ questionId: httpQId, selectedOptionId: httpOptId, timeTakenMs: 800 });
    questionHttpRes.steps.push({ name: 'POST record-question-attempt', ok: recAttRes.status === 200, id: httpQId });

    // 9. GET student attempts
    const studAttRes = await qRequest
      .get('/my-question-attempts')
      .set('x-user-sub', qStudentSub);
    const attFound = Array.isArray(studAttRes.body) && studAttRes.body.some((a) => a.questionId === httpQId);
    questionHttpRes.steps.push({ name: 'GET my-question-attempts', ok: studAttRes.status === 200 && attFound, sample: studAttRes.body && studAttRes.body.length, id: httpQId });

    // 10. Delete question via route
    const delQRes = await qRequest
      .post('/delete-question')
      .set('x-user-sub', qEducatorSub)
      .send({ id: httpQId });
    questionHttpRes.steps.push({ name: 'POST delete-question', ok: delQRes.status === 200, id: httpQId });
  } catch (err) {
    questionHttpRes.steps.push({ name: 'Question HTTP tests error', ok: false, error: err.message });
  } finally {
    // Cleanup DB rows that may still exist (defensive)
    try {
      if (httpQId) await dbPromise.query('DELETE FROM questions WHERE id = ?', [httpQId]);
      if (qEducatorSub) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [qEducatorSub]);
      if (qStudentSub) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [qStudentSub]);
    } catch (_) { /* ignore cleanup errors */ }
  }
  results.push(questionHttpRes);

  /* ---------- Badge Routes (HTTP) ---------- */
  const badgeHttpRes = { name: 'Badge Routes (HTTP)', steps: [] };
  try {
    const badgeApp = express();
    badgeApp.use(express.json({ limit: '2mb' }));
    badgeApp.use('/', require('./src/routes/badgeRoutes'));
    const badgeReq = supertest(badgeApp);
    const healthRes = await badgeReq.get('/health');
    badgeHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });

    // ------------------------------------------------------------------
    //  Badge CRUD flow
    // ------------------------------------------------------------------
    const badgeSub = `SELFTEST_BADGE_${ts}`;
    const badgeFile = `selftest_badge_${ts}.png`;
    const [badgeImgIns] = await dbPromise.query(
      'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageBadge", ?, ?)',
      [badgeFile, badgeFile, badgeSub, badgeSub]
    );
    const badgeImageId = badgeImgIns.insertId;
    const [badgeIns] = await dbPromise.query(
      'INSERT INTO Badges (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)',
      [badgeImageId, 'SelfTest Badge', 'desc', badgeSub, badgeSub]
    );
    const badgeId = badgeIns.insertId;
    badgeHttpRes.steps.push({ name: 'Seed badge', ok: !!badgeId, id: badgeId });

    const badgeAllRes = await badgeReq.get('/GetAllBadgesData');
    badgeHttpRes.steps.push({ name: 'GET /GetAllBadgesData', ok: badgeAllRes.status === 200 && Array.isArray(badgeAllRes.body), sample: Array.isArray(badgeAllRes.body) ? badgeAllRes.body.length : 'err', id: badgeId });

    const badgeSingleRes = await badgeReq.get(`/GetBadgeData/${badgeId}`);
    badgeHttpRes.steps.push({ name: 'GET /GetBadgeData/:id', ok: badgeSingleRes.status === 200 && badgeSingleRes.body, id: badgeId });

    const updBadgeRes = await badgeReq.post('/update-badge-field').set('x-user-sub', badgeSub).send({ id: badgeId, field: 'Title', value: 'Updated Badge' });
    badgeHttpRes.steps.push({ name: 'POST update-badge-field', ok: updBadgeRes.status === 200, id: badgeId });

    const delBadgeRes = await badgeReq.post('/delete-badge').set('x-user-sub', badgeSub).send({ ID: badgeId });
    badgeHttpRes.steps.push({ name: 'POST delete-badge', ok: delBadgeRes.status === 200, id: badgeId });

    await dbPromise.query('DELETE FROM Images WHERE id = ?', [badgeImageId]);
  } catch (err) {
    badgeHttpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  }
  results.push(badgeHttpRes);

  /* ---------- Character Routes (HTTP) ---------- */
  const characterHttpRes = { name: 'Character Routes (HTTP)', steps: [] };
  try {
    const charApp = express();
    charApp.use(express.json({ limit: '2mb' }));
    charApp.use('/', require('./src/routes/characterRoutes'));
    const charReq = supertest(charApp);
    const healthRes = await charReq.get('/health');
    characterHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });

    // ------------------------------------------------------------------
    //  Character CRUD flow – insert test row, hit all public routes
    // ------------------------------------------------------------------
    const charSub = `SELFTEST_CHAR_${ts}`;
    const charFile = `selftest_char_${ts}.png`;
    // 1) Seed DB rows directly so we have a valid record to exercise routes
    const [charImgIns] = await dbPromise.query(
      'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageCharacter", ?, ?)',
      [charFile, charFile, charSub, charSub]
    );
    const charImageId = charImgIns.insertId;
    const [charInsert] = await dbPromise.query(
      'INSERT INTO CharacterModels (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)',
      [charImageId, 'SelfTest Character', 'desc', charSub, charSub]
    );
    const charId = charInsert.insertId;
    characterHttpRes.steps.push({ name: 'Seed character', ok: !!charId, id: charId });

    // 2) GET all
    const charAllRes = await charReq.get('/GetAllCharacterData');
    characterHttpRes.steps.push({
      name: 'GET /GetAllCharacterData',
      ok: charAllRes.status === 200 && Array.isArray(charAllRes.body),
      sample: Array.isArray(charAllRes.body) ? charAllRes.body.length : 'err',
      id: charId
    });

    // 3) GET single
    const charSingleRes = await charReq.get(`/GetCharacterData/${charId}`);
    characterHttpRes.steps.push({
      name: 'GET /GetCharacterData/:id',
      ok: charSingleRes.status === 200 && charSingleRes.body,
      id: charId
    });

    // 4) Update title
    const updCharRes = await charReq
      .post('/update-character-field')
      .set('x-user-sub', charSub)
      .send({ id: charId, field: 'Title', value: 'Updated Character' });
    characterHttpRes.steps.push({ name: 'POST update-character-field', ok: updCharRes.status === 200, id: charId });

    // 5) Delete
    const delCharRes = await charReq
      .post('/delete-character')
      .set('x-user-sub', charSub)
      .send({ ID: charId });
    characterHttpRes.steps.push({ name: 'POST delete-character', ok: delCharRes.status === 200, id: charId });

    // 6) Cleanup image row
    await dbPromise.query('DELETE FROM Images WHERE id = ?', [charImageId]);
  } catch (err) {
    characterHttpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  }
  results.push(characterHttpRes);

  /* ---------- Backdrop Routes (HTTP) ---------- */
  const backdropHttpRes = { name: 'Backdrop Routes (HTTP)', steps: [] };
  try {
    const backApp = express();
    backApp.use(express.json({ limit: '2mb' }));
    backApp.use('/', require('./src/routes/backdropRoutes'));
    const backReq = supertest(backApp);
    const healthRes = await backReq.get('/health');
    backdropHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });

    // ------------------------------------------------------------------
    //  Backdrop CRUD flow – insert, read, update, delete
    // ------------------------------------------------------------------
    const backSub = `SELFTEST_BACKDROP_${ts}`;
    const backFile = `selftest_backdrop_${ts}.png`;
    const [backImgIns] = await dbPromise.query(
      'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageBackdrop", ?, ?)',
      [backFile, backFile, backSub, backSub]
    );
    const backImageId = backImgIns.insertId;
    const [backIns] = await dbPromise.query(
      'INSERT INTO Backdrops (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)',
      [backImageId, 'SelfTest Backdrop', 'desc', backSub, backSub]
    );
    const backdropId = backIns.insertId;
    backdropHttpRes.steps.push({ name: 'Seed backdrop', ok: !!backdropId, id: backdropId });

    const backAllRes = await backReq.get('/GetAllBackdropData');
    backdropHttpRes.steps.push({
      name: 'GET /GetAllBackdropData',
      ok: backAllRes.status === 200 && Array.isArray(backAllRes.body),
      sample: Array.isArray(backAllRes.body) ? backAllRes.body.length : 'err',
      id: backdropId
    });

    const backSingleRes = await backReq.get(`/GetBackdropData/${backdropId}`);
    backdropHttpRes.steps.push({ name: 'GET /GetBackdropData/:id', ok: backSingleRes.status === 200 && backSingleRes.body, id: backdropId });

    const updBackRes = await backReq
      .post('/update-backdrop-field')
      .set('x-user-sub', backSub)
      .send({ id: backdropId, field: 'Title', value: 'Updated Backdrop' });
    backdropHttpRes.steps.push({ name: 'POST update-backdrop-field', ok: updBackRes.status === 200, id: backdropId });

    const delBackRes = await backReq.post('/delete-backdrop').set('x-user-sub', backSub).send({ ID: backdropId });
    backdropHttpRes.steps.push({ name: 'POST delete-backdrop', ok: delBackRes.status === 200, id: backdropId });

    await dbPromise.query('DELETE FROM Images WHERE id = ?', [backImageId]);
  } catch (err) {
    backdropHttpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  }
  results.push(backdropHttpRes);

  /* ---------- Instruction Routes (HTTP) ---------- */
  const instructionHttpRes = { name: 'Instruction Routes (HTTP)', steps: [] };
  try {
    const instApp = express();
    instApp.use(express.json({ limit: '2mb' }));
    instApp.use('/', require('./src/routes/instructionRoutes'));
    const instReq = supertest(instApp);
    const healthRes = await instReq.get('/health');
    instructionHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });

    // ------------------------------------------------------------------
    //  Instruction CRUD flow
    // ------------------------------------------------------------------
    const instrSub = `SELFTEST_INSTR_${ts}`;
    const instrFile = `selftest_instr_${ts}.png`;
    const [instrImgIns] = await dbPromise.query(
      'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageInstruction", ?, ?)',
      [instrFile, instrFile, instrSub, instrSub]
    );
    const instrImageId = instrImgIns.insertId;
    const [instrIns] = await dbPromise.query(
      'INSERT INTO StudentInstructions (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)',
      [instrImageId, 'SelfTest Instruction', 'desc', instrSub, instrSub]
    );
    const instructionId = instrIns.insertId;
    instructionHttpRes.steps.push({ name: 'Seed instruction', ok: !!instructionId, id: instructionId });

    const instrAllRes = await instReq.get('/GetAllInstructionData');
    instructionHttpRes.steps.push({ name: 'GET /GetAllInstructionData', ok: instrAllRes.status === 200 && Array.isArray(instrAllRes.body), sample: Array.isArray(instrAllRes.body) ? instrAllRes.body.length : 'err', id: instructionId });

    const instrSingleRes = await instReq.get(`/GetInstructionData/${instructionId}`);
    instructionHttpRes.steps.push({ name: 'GET /GetInstructionData/:id', ok: instrSingleRes.status === 200 && instrSingleRes.body, id: instructionId });

    const updInstrRes = await instReq.post('/update-instruction-field').set('x-user-sub', instrSub).send({ id: instructionId, field: 'Title', value: 'Updated Instruction' });
    instructionHttpRes.steps.push({ name: 'POST update-instruction-field', ok: updInstrRes.status === 200, id: instructionId });

    const delInstrRes = await instReq.post('/delete-instruction').set('x-user-sub', instrSub).send({ ID: instructionId });
    instructionHttpRes.steps.push({ name: 'POST delete-instruction', ok: delInstrRes.status === 200, id: instructionId });

    await dbPromise.query('DELETE FROM Images WHERE id = ?', [instrImageId]);
  } catch (err) {
    instructionHttpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  }
  results.push(instructionHttpRes);

  /* ---------- Tag Routes (HTTP) ---------- */
  const tagHttpRes = { name: 'Tag Routes (HTTP)', steps: [] };
  try {
    const tagApp = express();
    tagApp.use(express.json({ limit: '2mb' }));
    tagApp.use('/', require('./src/routes/tagRoutes'));
    const tagReq = supertest(tagApp);
    const healthRes = await tagReq.get('/health');
    tagHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });

    // ------------------------------------------------------------------
    //  Tag list & create flow
    // ------------------------------------------------------------------
    const tagSub = `SELFTEST_TAG_${ts}`;
    await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, iseducator, creation_date) VALUES (?, ?, 1, NOW())', [tagSub, `${tagSub}@example.com`]);
    tagHttpRes.steps.push({ name: 'Seed educator user', ok: true, sample: tagSub, id: tagSub });

    // Snapshot list size before create
    const tagListBefore = await tagReq.get('/tags');
    tagHttpRes.steps.push({ name: 'GET /tags (before)', ok: tagListBefore.status === 200 && Array.isArray(tagListBefore.body), sample: tagListBefore.body.length, id: 1 });

    // Create new tag
    const tagName = `SelfTestTag_${ts}`;
    const createTagRes = await tagReq.post('/create-tag').set('x-user-sub', tagSub).send({ name: tagName });
    const newTagId = createTagRes.body && createTagRes.body.tagId;
    tagHttpRes.steps.push({ name: 'POST create-tag', ok: createTagRes.status === 200 && !!newTagId, id: newTagId });

    // Verify appears in list
    const tagListAfter = await tagReq.get('/tags');
    const foundTag = Array.isArray(tagListAfter.body) && tagListAfter.body.some(t => t.id === newTagId);
    tagHttpRes.steps.push({ name: 'GET /tags (after)', ok: tagListAfter.status === 200 && foundTag, sample: tagListAfter.body.length, id: newTagId });

    // Cleanup DB rows
    if (newTagId) await dbPromise.query('DELETE FROM tags WHERE id = ?', [newTagId]);
    await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [tagSub]);
    tagHttpRes.steps.push({ name: 'Cleanup tag & user', ok: true, id: newTagId || 0 });
  } catch (err) {
    tagHttpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  }
  results.push(tagHttpRes);

  /* ---------- Legacy Health Route (HTTP) ---------- */
  const legacyHttpRes = { name: 'Legacy Health Route (HTTP)', steps: [] };
  try {
    const legacyApp = express();
    legacyApp.use(express.json({ limit: '2mb' }));
    legacyApp.use('/', require('./src/routes/legacyRoutes'));
    const legacyReq = supertest(legacyApp);
    const healthRes = await legacyReq.get('/legacy-health');
    legacyHttpRes.steps.push({
      name: 'GET /legacy-health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.status,
      id: 0
    });
  } catch (err) {
    legacyHttpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  }
  results.push(legacyHttpRes);

  /* ---------- Question Operations tests ---------- */
  const questionRes = { name: 'Question Operations', steps: [] };
  let questionId; let optionId;
  try {
    questionId = await questionOps.createBlankQuestion(userSub, null);
    questionRes.steps.push({ name: 'Create blank question', ok: !!questionId, sample: 'blank', id: questionId });

    await questionOps.updateQuestionField(questionId, 'QuestionText', 'Self-test question?');
    questionRes.steps.push({ name: 'Update text', ok: true, sample: 'Self-test question?', id: questionId });

    optionId = await questionOps.createQuestionOption(questionId, userSub);
    questionRes.steps.push({ name: 'Add option', ok: !!optionId, sample: 'Option placeholder', id: optionId });

    await questionOps.updateQuestionOption(optionId, 'Option A', 'Because.', questionId);
    await questionOps.setCorrectOption(questionId, optionId);
    questionRes.steps.push({ name: 'Set correct option', ok: true, sample: 'Option A', id: optionId });

    const attempt = await questionOps.recordQuestionAttempt(questionId, userSub, optionId);
    questionRes.steps.push({ name: 'Record attempt', ok: attempt && attempt.isCorrect === 1, sample: 'Attempt Option A', id: attempt && (attempt.AttemptID || attempt.id || attempt.insertId) });

    const attempts = await questionOps.getAttemptsForUser(userSub, questionId);
    questionRes.steps.push({ name: 'Fetch attempts', ok: Array.isArray(attempts) && attempts.length > 0, sample: 'All', id: questionId });
  } catch (err) {
    questionRes.steps.push({ name: 'Error', ok: false, error: err.message });
  } finally {
    if (questionId) {
      try { await questionOps.deleteQuestion(questionId); } catch (_) { /* ignore */ }
    }
  }
  results.push(questionRes);

  /* ---------- Article Operations tests ---------- */
  const articleRes = { name: 'Article Operations', steps: [] };
  let articleId;
  try {
    articleId = await articleOps.createArticleLink('Self-test article', 'https://example.com', userSub, 'Desc', false);
    articleRes.steps.push({ name: 'Create article link', ok: !!articleId, sample: 'Self-test article', id: articleId });

    await articleOps.updateArticle(articleId, { title: 'Updated article' });
    articleRes.steps.push({ name: 'Update article', ok: true, sample: 'Updated article', id: articleId });

    await articleOps.submitArticleForApproval(articleId, userSub);
    articleRes.steps.push({ name: 'Submit for approval', ok: true, sample: 'Submit', id: articleId });

    await articleOps.approveArticle(articleId, userSub);
    articleRes.steps.push({ name: 'Approve article', ok: true, sample: 'Approve', id: articleId });
  } catch (err) {
    articleRes.steps.push({ name: 'Error', ok: false, error: err.message });
  } finally {
    if (articleId) {
      try { await articleOps.deleteArticle(articleId); } catch (_) { /* ignore */ }
      articleRes.steps.push({ name: 'Delete article', ok: true, id: articleId });
    }
  }
  results.push(articleRes);

  /* ---------- Image Upload (Badge) tests ---------- */
  const imageRes = { name: 'Image Upload (Badges)', steps: [] };
  try {
    const tmpDir = path.join(__dirname, 'tmp_selftest_badges');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const baseName = `selftest_${ts}`;
    const tmpPath = path.join(tmpDir, baseName);
    fs.writeFileSync(tmpPath, 'x');

    // Mock req/res
    const reqMock = {
      file: {
        filename: baseName,
        path: tmpPath,
        destination: tmpDir,
        originalname: baseName + '.png'
      },
      body: { userSub }
    };

    const uploadResult = await new Promise((resolve) => {
      const resMock = {
        status: (code) => ({
          json: (data) => resolve({ code, data }),
          send: (data) => resolve({ code, error: data })
        }),
        json: (data) => resolve({ code: 200, data }),
        send: (msg) => resolve({ code: 200, error: msg })
      };
      BadgeUploadHandler(reqMock, resMock);
    });

    if (uploadResult.code === 200 && uploadResult.data && uploadResult.data.BadgeID) {
      imageRes.steps.push({ name: 'Badge upload', ok: true, sample: baseName + '.png', id: uploadResult.data.BadgeID });

      const BadgeID = uploadResult.data.BadgeID;
      // Cleanup DB rows created
      try {
        await dbPromise.query('DELETE FROM Badges WHERE ID = ?', [BadgeID]);
        await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [baseName + '.png']);
      } catch (_) {}

      // Remove saved file if exists
      const savedFilePath = path.join(tmpDir, baseName + '.png');
      if (fs.existsSync(savedFilePath)) {
        fs.unlinkSync(savedFilePath);
      }
    } else {
      imageRes.steps.push({ name: 'Badge upload', ok: false, error: uploadResult.error || 'Unknown error' });
    }
  } catch (err) {
    imageRes.steps.push({ name: 'Badge upload', ok: false, error: err.message });
  }
  results.push(imageRes);

  /* ---------- Image Upload (Core Types) ---------- */
  const uploadRes = { name: 'Image Upload (Core Types)', steps: [] };
  try {
    const tmpDir = path.join(__dirname, 'tmp_selftest_uploads');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const writeTemp = (base) => {
      const p = path.join(tmpDir, base);
      fs.writeFileSync(p, 'x');
      return p;
    };

    // Generic helper to run a handler and push result row
    async function runUpload(label, handler, bodyExtras, expectKey, cleanup) {
      const base = `st_${label.toLowerCase()}_${ts}`;
      const tmpPath = writeTemp(base);
      const reqMock = {
        file: { filename: base, path: tmpPath, destination: tmpDir, originalname: base + '.png' },
        body: { userSub, ...bodyExtras }
      };
      const resObj = await new Promise((resolve) => {
        const resMock = {
          status: (c) => ({ json: (d) => resolve({ code: c, data: d }), send: (d) => resolve({ code: c, error: d }) }),
          json: (d) => resolve({ code: 200, data: d }),
          send: (m) => resolve({ code: 200, error: m })
        };
        handler(reqMock, resMock);
      });
      const ok = resObj.code === 200 && resObj.data && (!expectKey || resObj.data[expectKey]);
      uploadRes.steps.push({ name: `${label} upload`, ok, id: ok ? resObj.data[expectKey] || 0 : 0, error: ok ? undefined : resObj.error });
      if (ok && cleanup) await cleanup(resObj.data, base);
    }

    // Character
    await runUpload('Character', CharacterUploadHandler, { title: 'SelfTest', description: '' }, 'CharacterID', async (d, base) => {
      await dbPromise.query('DELETE FROM CharacterModels WHERE ID = ?', [d.CharacterID]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });

    // Backdrop
    await runUpload('Backdrop', BackdropUploadHandler, { title: 'SelfTest', description: '' }, 'BackdropID', async (d, base) => {
      await dbPromise.query('DELETE FROM Backdrops WHERE ID = ?', [d.BackdropID]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });

    // Instruction
    await runUpload('Instruction', InstructionUploadHandler, { title: 'SelfTest', description: '' }, 'InstructionID', async (d, base) => {
      await dbPromise.query('DELETE FROM StudentInstructions WHERE ID = ?', [d.InstructionID]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });

    // Profile (needs user row first)
    const profileSub = `SELFTEST_PROFILE_${ts}`;
    const [profIns] = await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, creation_date) VALUES (?, ?, NOW())', [profileSub, `${profileSub}@example.com`]);
    const profileId = profIns.insertId;
    await runUpload('Profile', ProfileUploadHandler, { userId: profileId, userSub: profileSub }, 'imageUrl', async (_d, base) => {
      await dbPromise.query('DELETE FROM UserAccounts WHERE id = ?', [profileId]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });

    // Encounter (needs encounter row)
    const encSub = `SELFTEST_ENCUP_${ts}`;
    const [encIns] = await dbPromise.query('INSERT INTO Encounters (_REC_Creation_User, _REC_Modification_User, IsRootEncounter) VALUES (?, ?, 0)', [encSub, encSub]);
    const encounterId = encIns.insertId;
    await runUpload('Encounter', EncounterUploadHandler, {
      userSub: encSub,
      EncounterID: encounterId,
      EncountersField: 'ImageBackdrop',
      ImageType: 'ImageBackdrop'
    }, 'ID', async (d, base) => {
      await dbPromise.query('DELETE FROM Encounters WHERE ID = ?', [encounterId]);
      await dbPromise.query('DELETE FROM Images WHERE ID = ?', [d.ID]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });
  } catch (err) {
    uploadRes.steps.push({ name: 'Block error', ok: false, error: err.message });
  }
  results.push(uploadRes);

  /* ---------- UserAccounts CRUD tests ---------- */
  const userRes = { name: 'UserAccounts CRUD', steps: [] };
  let newUserId;
  try {
    const uniqueSub = `SELFTEST_${ts}`;
    const uniqueEmail = `selftest_${ts}@example.com`;

    const insertSql = 'INSERT INTO UserAccounts (auth0_sub, email, creation_date) VALUES (?, ?, NOW())';
    const [insertRes] = await dbPromise.query(insertSql, [uniqueSub, uniqueEmail]);
    newUserId = insertRes.insertId;
    userRes.steps.push({ name: 'Create user', ok: !!newUserId, sample: uniqueEmail, id: newUserId });

    // Fetch
    const [rows1] = await dbPromise.query('SELECT email FROM UserAccounts WHERE id = ?', [newUserId]);
    userRes.steps.push({ name: 'Fetch user', ok: rows1.length === 1 && rows1[0].email === uniqueEmail, sample: rows1[0] && rows1[0].email, id: newUserId });

    // Update display_name
    await dbPromise.query('UPDATE UserAccounts SET display_name = ? WHERE id = ?', ['SelfTestUser', newUserId]);
    const [rows2] = await dbPromise.query('SELECT display_name FROM UserAccounts WHERE id = ?', [newUserId]);
    userRes.steps.push({ name: 'Update user', ok: rows2.length === 1 && rows2[0].display_name === 'SelfTestUser', sample: rows2[0] && rows2[0].display_name, id: newUserId });
  } catch (err) {
    userRes.steps.push({ name: 'CRUD error', ok: false, error: err.message });
  } finally {
    if (newUserId) {
      try { await dbPromise.query('DELETE FROM UserAccounts WHERE id = ?', [newUserId]); } catch (_) {}
      userRes.steps.push({ name: 'Delete user', ok: true, id: newUserId });
    }
  }
  results.push(userRes);

  /* ---------- Converted Delete Endpoints (Badges/Characters/Backdrops/Instructions) ---------- */
  const delRes = { name: 'Converted DELETE Handlers', steps: [] };
  try {
    // CharacterModels
    try {
      const [rows] = await dbPromise.query('SELECT ID FROM CharacterModels LIMIT 1');
      const delId = rows.length ? rows[0].ID : -1;
      await dbPromise.query('DELETE FROM CharacterModels WHERE ID = ?', [delId]);
      delRes.steps.push({ name: 'Delete CharacterModels row', ok: true, id: delId });
    } catch (err) {
      delRes.steps.push({ name: 'Delete CharacterModels row', ok: false, error: err.message });
    }

    // Backdrops
    try {
      const [rows] = await dbPromise.query('SELECT ID FROM Backdrops LIMIT 1');
      const delId = rows.length ? rows[0].ID : -1;
      await dbPromise.query('DELETE FROM Backdrops WHERE ID = ?', [delId]);
      delRes.steps.push({ name: 'Delete Backdrops row', ok: true, id: delId });
    } catch (err) {
      delRes.steps.push({ name: 'Delete Backdrops row', ok: false, error: err.message });
    }

    // StudentInstructions
    try {
      const [rows] = await dbPromise.query('SELECT ID FROM StudentInstructions LIMIT 1');
      const delId = rows.length ? rows[0].ID : -1;
      await dbPromise.query('DELETE FROM StudentInstructions WHERE ID = ?', [delId]);
      delRes.steps.push({ name: 'Delete StudentInstructions row', ok: true, id: delId });
    } catch (err) {
      delRes.steps.push({ name: 'Delete StudentInstructions row', ok: false, error: err.message });
    }
  } catch (outerErr) {
    delRes.steps.push({ name: 'Delete tests error', ok: false, error: outerErr.message });
  }
  results.push(delRes);

  /* ---------- Quick-Win Refactor Integrity ---------- */
  const refactorRes = { name: 'Quick-Win Integrity', steps: [] };
  try {
    // 1. utils/auth.js exports
    let authMod;
    try {
      authMod = require('./utils/auth');
      const ok =
        typeof authMod.isUserAdminBySub === 'function' &&
        typeof authMod.isUserEducatorBySub === 'function';
      refactorRes.steps.push({
        name: 'utils/auth exports functions',
        ok,
        sample: Object.keys(authMod).join(', '),
        id: ok ? 1 : 0
      });
    } catch (err) {
      refactorRes.steps.push({ name: 'utils/auth load error', ok: false, error: err.message });
    }

    // 2. Role helpers return false for unknown sub (should not throw)
    try {
      const adminFalse = await authMod.isUserAdminBySub('SELFTEST_NONEXISTENT');
      const eduFalse   = await authMod.isUserEducatorBySub('SELFTEST_NONEXISTENT');
      const ok = adminFalse === false && eduFalse === false;
      refactorRes.steps.push({
        name: 'Role helpers default to false',
        ok,
        sample: `admin:${adminFalse}, educator:${eduFalse}`,
        id: 2
      });
    } catch (err) {
      refactorRes.steps.push({ name: 'Role helper execution error', ok: false, error: err.message });
    }

    // 3. asyncHandler forwards errors to next()
    try {
      const asyncHandler = require('./utils/asyncHandler');
      let passedToNext = false;
      const wrapped = asyncHandler(async () => { throw new Error('boom'); });
      await new Promise((resolve) => {
        wrapped({}, {}, (err) => { passedToNext = err instanceof Error; resolve(); });
      });
      refactorRes.steps.push({
        name: 'asyncHandler passes errors',
        ok: passedToNext,
        sample: passedToNext ? 'Error captured' : 'No error',
        id: 3
      });
    } catch (err) {
      refactorRes.steps.push({ name: 'asyncHandler test error', ok: false, error: err.message });
    }

    // 4. imageRoutes registers expected endpoints
    try {
      const { setupImageRoutes } = require('./imageRoutes');
      const registered = [];
      const appStub = {
        post: (path /*, ...rest */) => registered.push(path)
      };
      setupImageRoutes(appStub);
      const expected = [
        '/images/uploads/encounters/',
        '/images/uploads/backdrops/',
        '/images/uploads/characters/',
        '/images/uploads/badges/',
        '/images/uploads/instructions/',
        '/images/uploads/profiles/'
      ];
      const missing = expected.filter(e => !registered.includes(e));
      refactorRes.steps.push({
        name: 'imageRoutes registers endpoints',
        ok: missing.length === 0,
        sample: registered.join(', '),
        id: registered.length,
        error: missing.length ? 'Missing: ' + missing.join(', ') : undefined
      });
    } catch (err) {
      refactorRes.steps.push({ name: 'imageRoutes test error', ok: false, error: err.message });
    }
  } catch (outerErr) {
    refactorRes.steps.push({ name: 'Refactor test block error', ok: false, error: outerErr.message });
  }
  results.push(refactorRes);

  /* ---------- Uploads Health Route tests ---------- */
  const uploadsHealthRes = { name: 'Uploads Health Route (HTTP)', steps: [] };
  try {
    const upApp = express();
    upApp.use(express.json({ limit: '2mb' }));
    require('./imageRoutes').setupImageRoutes(upApp);
    const upReq = supertest(upApp);

    const upHealth = await upReq.get('/api/uploads/health');
    uploadsHealthRes.steps.push({
      name: 'GET /api/uploads/health',
      ok: upHealth.status === 200 && upHealth.body && upHealth.body.status === 'ok',
      sample: upHealth.body && upHealth.body.service,
      id: 0
    });
  } catch (err) {
    uploadsHealthRes.steps.push({ name: 'Uploads health test error', ok: false, error: err.message });
  }
  results.push(uploadsHealthRes);

  return results;
}

router.get('/admin/selftest', async (req, res) => {
  try {
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'] || req.query.sub;
    if (!requestSub) return res.status(401).send('Unauthorized – user sub missing');

    const isAdmin = await isUserAdminBySub(requestSub);
    if (!isAdmin) return res.status(403).send('Forbidden – admin only');

    const results = await runOpsSelfTest(requestSub);

    // Split into DB-focused and Route-focused result sets so the UI
    // can display them under the correct outer tab.
    const routeResults = results.filter(r => /Routes/i.test(r.name));
    const dbResults    = results.filter(r => !/Routes/i.test(r.name));

    // If client requests JSON explicitly, preserve previous behaviour by
    // returning the full combined array for programmatic access.
    if (req.query.format === 'json') return res.json(results);

    // Otherwise build the HTML view with separate categories.
    const html = buildHtml(dbResults, routeResults);
    res.set('Content-Type', 'text/html').send(html);
  } catch (err) {
    console.error('Self-test error:', err);
    res.status(500).send('Server error');
  }
});

function buildHtml(dbResults, routeResults = []) {
  const style = `<style>
      body{font-family:Arial,Helvetica,sans-serif;padding:20px;}
      .outerTabBar,.tabbar{margin:0 0 20px 0;display:flex;flex-wrap:wrap;gap:8px;}
      .outerTabBtn,.tabbtn{background:#eee;border:1px solid #ccc;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:14px;}
      .outerTabBtn.active,.tabbtn.active{background:#d6eaff;border-color:#6bb0ff;}
      table{border-collapse:collapse;margin:12px 0 32px;width:100%;max-width:900px;}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;vertical-align:top;}
      th{background:#f5f5f5;}
      .ok{color:green;font-weight:bold;}
      .fail{color:red;font-weight:bold;}
  </style>`;

  const escape = (str) => (str || '').toString().replace(/[&<>"'`]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));

  // Build inner tab markup generator
  const makeInner = (sections, outerIdx) => {
    if (!sections || sections.length === 0) return '<p>No tests yet.</p>';
    const innerBtns = sections.map((r,i)=>`<button class="tabbtn inner${outerIdx}-tabbtn${i===0?' active':''}" onclick="showInner(${outerIdx},${i},this)">${escape(r.name)}</button>`).join('');
    const innerSections = sections.map((r,i)=>{
      const rows = r.steps.map(s=>`<tr><td>${escape(s.name)}</td><td>${escape(s.sample)}</td><td>${escape(s.id)}</td><td class="${s.ok?'ok':'fail'}">${s.ok?'PASS':'FAIL'}</td><td>${escape(s.error)}</td></tr>`).join('');
      return `<div class="tabcontent inner${outerIdx}-tabcontent" style="display:${i===0?'block':'none'}"><h2>${escape(r.name)}</h2><table><thead><tr><th>Step</th><th>Sample Data</th><th>Result ID</th><th>Status</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    return `<div class="tabbar">${innerBtns}</div>${innerSections}`;
  };

  // Top-level tabs: Database (0) & Routes (1)
  const outerBtns = ['Database','Routes'].map((label,i)=>`<button class="outerTabBtn${i===0?' active':''}" onclick="showOuter(${i},this)">${label}</button>`).join('');

  const dbInnerHtml = makeInner(dbResults, 0);
  const routesInnerHtml = makeInner(routeResults, 1);

  const outerSections = [dbInnerHtml, routesInnerHtml].map((html,i)=>`<div class="outerTabContent" style="display:${i===0?'block':'none'}">${html}</div>`).join('');

  const script = `<script>
      function showOuter(idx,btn){
        document.querySelectorAll('.outerTabContent').forEach((el,i)=>el.style.display=i===idx?'block':'none');
        document.querySelectorAll('.outerTabBtn').forEach(b=>b.classList.remove('active'));
        if(btn) btn.classList.add('active');
      }
      function showInner(outerIdx,innerIdx,btn){
        document.querySelectorAll('.inner'+outerIdx+'-tabcontent').forEach((el,i)=>el.style.display=i===innerIdx?'block':'none');
        document.querySelectorAll('.inner'+outerIdx+'-tabbtn').forEach(b=>b.classList.remove('active'));
        if(btn) btn.classList.add('active');
      }
  </script>`;

  const quickLinks = `<div style="margin-bottom:20px;">
      <strong>Health Endpoints:</strong>
      <a href="/api/auth/health" style="margin-left:12px;">/api/auth/health</a> |
      <a href="/api/uploads/health" style="margin-left:12px;">/api/uploads/health</a> |
      <a href="/api/lectures/health" style="margin-left:12px;">/api/lectures/health</a> |
      <a href="/api/badges/health" style="margin-left:12px;">/api/badges/health</a> |
      <a href="/api/characters/health" style="margin-left:12px;">/api/characters/health</a> |
      <a href="/api/backdrops/health" style="margin-left:12px;">/api/backdrops/health</a> |
      <a href="/api/instructions/health" style="margin-left:12px;">/api/instructions/health</a> |
      <a href="/api/tags/health" style="margin-left:12px;">/api/tags/health</a> |
      <a href="/api/legacy-health" style="margin-left:12px;">/api/legacy-health</a>
    </div>`;

  return `<!DOCTYPE html><html><head><title>Operations Self-Test</title>${style}</head><body><h1>Operations Self-Test Results</h1>${quickLinks}<div class="outerTabBar">${outerBtns}</div>${outerSections}${script}</body></html>`;
}

module.exports = { setupSelfTestRoutes: (app) => app.use('/', router) }; 