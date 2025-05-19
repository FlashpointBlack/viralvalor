// Helper utilities for self-test routes, extracted from legacy selfTestRoutes.js

// Adjusted paths for dependencies (assuming this file is in src/routes/)
const { dbPromise } = require('../../db'); // Was ./db in original root file
const journalOps = require('../../journalOperations'); // Was ./journalOperations
const lectureOps = require('../../lectureOperations'); // Was ./lectureOperations
const questionOps = require('../../questionOperations'); // Was ./questionOperations
const articleOps = require('../../articleOperations'); // Was ./articleOperations
const { BadgeUploadHandler, CharacterUploadHandler, BackdropUploadHandler, InstructionUploadHandler, ProfileUploadHandler, EncounterUploadHandler } = require('../../imageHandlers'); // Was ./imageHandlers
const fs = require('fs');
const path = require('path');
// isUserAdminBySub will be imported in the main router file, not directly here if not used by runOpsSelfTest internally.
// For now, keep it if runOpsSelfTest or buildHtml depend on it via a direct call not passed as param.
// It seems isUserAdminBySub is used in the main route handler, not these utils directly.
// const { isUserAdminBySub } = require('../utils/auth'); 
const supertest = require('supertest'); 

// Assuming lectureRoutes will be/is in src/routes/
const { setupLectureRoutes } = require('../../lectureRoutes'); // Was ./lectureRoutes in original root file

// Runs all operation-level integration tests and returns a structured result object
async function runOpsSelfTest(userSub) {
  const results = [];
  const ts = Date.now();

  /* ---------- Migration Completeness (dbPromise) ---------- */
  const migrateRes = { name: 'dbPromise Migration Scan', steps: [] };
  try {
    // Path for scanning JS files, from project root. __dirname is now src/routes
    const projectRoot = path.resolve(__dirname, '../..'); 
    const pendingFiles = [projectRoot];
    const offenders = [];

    while (pendingFiles.length) {
      const p = pendingFiles.pop();
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        const dirName = path.basename(p);
        if (['node_modules', '.git', 'tmp_selftest_badges', '.cursor', 'cursornotes'].includes(dirName)) continue;
        fs.readdirSync(p).forEach(f => pendingFiles.push(path.join(p, f)));
      } else if (stat.isFile() && p.endsWith('.js')) {
        // Ignore self-test utility and API files
        if (p.endsWith('selfTestUtils.js') || p.endsWith('selfTestRoutesApi.js') || p.endsWith('selfTestRoutes.js')) continue;
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
      sample: 'All *.js files (excluding self-test files)',
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
    lectId = await lectureOps.createBlankLecture(userSub, `SELFTEST_${ts}`, 'Self-test lecture');
    lectureRes.steps.push({ name: 'Create blank lecture', ok: !!lectId, sample: 'SELFTEST', id: lectId });

    await lectureOps.updateLecture(lectId, { title: 'Updated SELFTEST' });
    lectureRes.steps.push({ name: 'Update lecture', ok: true, sample: 'Updated SELFTEST', id: lectId });

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
    const testApp = require('express')(); // Require express locally for test app
    testApp.use(require('express').json({ limit: '5mb' }));
    setupLectureRoutes(testApp); 

    const request = supertest(testApp);

    testUserSub = `SELFTEST_HTTP_${ts}`;
    await dbPromise.query(
      'INSERT INTO UserAccounts (auth0_sub, email, iseducator, creation_date) VALUES (?, ?, 1, NOW())',
      [testUserSub, `${testUserSub}@example.com`]
    );
    lectureHttpRes.steps.push({ name: 'Create educator user', ok: true, sample: testUserSub, id: testUserSub });

    const createRes = await request
      .post('/create-blank-lecture')
      .set('x-user-sub', testUserSub)
      .send({ userSub: testUserSub, title: 'SelfTest Lecture', description: 'via HTTP' });

    httpLectureId = createRes.body && createRes.body.lectureId;
    lectureHttpRes.steps.push({ name: 'POST create-blank-lecture', ok: createRes.status === 200 && !!httpLectureId, sample: httpLectureId, id: httpLectureId });

    const listRes = await request.get('/my-lectures').set('x-user-sub', testUserSub);
    const found = Array.isArray(listRes.body) && listRes.body.some((row) => row.id === httpLectureId);
    lectureHttpRes.steps.push({ name: 'GET my-lectures', ok: listRes.status === 200 && found, sample: listRes.body && listRes.body.length, id: httpLectureId });

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
    const encApp = require('express')();
    encApp.use(require('express').json({ limit: '5mb' }));
    const encounterRouter = require('./encounterRoutes'); // Was ./src/routes/encounterRoutes
    encApp.use('/', encounterRouter);
    const encRequest = supertest(encApp);

    const encHealthRes = await encRequest.get('/health');
    encounterHttpRes.steps.push({
      name: 'GET /health',
      ok: encHealthRes.status === 200 && encHealthRes.body && encHealthRes.body.status === 'ok',
      sample: encHealthRes.body && encHealthRes.body.service,
      id: 0
    });
    const encSub = `SELFTEST_ENC_${ts}`;
    const createRes = await encRequest
      .post('/create-blank-encounter')
      .set('x-user-sub', encSub)
      .send({ userSub: encSub });
    encounterId = createRes.body && createRes.body.encounterId;
    encounterHttpRes.steps.push({ name: 'POST create-blank-encounter', ok: createRes.status === 200 && !!encounterId, sample: encounterId, id: encounterId });
    const updRes = await encRequest
      .post('/update-encounter-field')
      .set('x-user-sub', encSub)
      .send({ id: encounterId, field: 'Title', value: 'SELFTEST_TITLE' });
    encounterHttpRes.steps.push({ name: 'POST update-encounter-field', ok: updRes.status === 200, id: encounterId });
    const getRes = await encRequest
      .get(`/GetEncounterData/${encounterId}`)
      .set('x-user-sub', encSub);
    const getOk = getRes.status === 200 && getRes.body && getRes.body.Encounter && Number(getRes.body.Encounter.ID) === Number(encounterId);
    encounterHttpRes.steps.push({ name: 'GET GetEncounterData', ok: getOk, sample: getRes.body && getRes.body.Encounter && getRes.body.Encounter.Title, id: encounterId });
    const choiceRes = await encRequest
      .post('/create-encounter-choice')
      .set('x-user-sub', encSub)
      .send({ EncounterID: encounterId, UserSub: encSub });
    choiceId = choiceRes.body && choiceRes.body.ID;
    encounterHttpRes.steps.push({ name: 'POST create-encounter-choice', ok: choiceRes.status === 200 && !!choiceId, id: choiceId });
    const dupRes = await encRequest
      .post('/duplicateEncounter')
      .set('x-user-sub', encSub)
      .send({ encounterId: encounterId, userSub: encSub });
    duplicateId = dupRes.body && dupRes.body.newEncounterId;
    encounterHttpRes.steps.push({ name: 'POST duplicateEncounter', ok: dupRes.status === 200 && !!duplicateId, id: duplicateId });
    const updChoiceRes = await encRequest
      .post('/update-encounter-choice')
      .set('x-user-sub', encSub)
      .send({ ID: choiceId, Title: 'Option SelfTest' });
    encounterHttpRes.steps.push({ name: 'POST update-encounter-choice', ok: updChoiceRes.status === 200, id: choiceId });
    const setRecvRes = await encRequest
      .post('/set-receiving-encounter')
      .set('x-user-sub', encSub)
      .send({ RouteID: choiceId, selectedEncounterID: duplicateId });
    encounterHttpRes.steps.push({ name: 'POST set-receiving-encounter', ok: setRecvRes.status === 200, id: choiceId });
    const unlinkedRes = await encRequest.get('/unlinked-encounters');
    encounterHttpRes.steps.push({ name: 'GET unlinked-encounters', ok: unlinkedRes.status === 200, sample: Array.isArray(unlinkedRes.body) ? unlinkedRes.body.length : 'err', id: (unlinkedRes.body && unlinkedRes.body.length) || 0 });
    const rootRes = await encRequest.get('/root-encounters').set('x-user-sub', encSub);
    const rootFound = Array.isArray(rootRes.body) && rootRes.body.some((row) => row.ID === encounterId);
    encounterHttpRes.steps.push({ name: 'GET root-encounters', ok: rootRes.status === 200 && rootFound, sample: rootRes.body && rootRes.body.length, id: rootRes.body && rootRes.body.length });
    const delChoiceRes = await encRequest
      .post('/delete-encounter-choice')
      .set('x-user-sub', encSub)
      .send({ ID: choiceId });
    encounterHttpRes.steps.push({ name: 'POST delete-encounter-choice', ok: delChoiceRes.status === 200, id: choiceId });
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
    const qApp = require('express')();
    qApp.use(require('express').json({ limit: '5mb' }));
    const questionRouter = require('./questionRoutes'); // Was ./src/routes/questionRoutes
    qApp.use('/', questionRouter);
    const qRequest = supertest(qApp);

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
    const createQRes = await qRequest
      .post('/create-blank-question')
      .set('x-user-sub', qEducatorSub)
      .send({ userSub: qEducatorSub });
    httpQId = createQRes.body && createQRes.body.questionId;
    questionHttpRes.steps.push({ name: 'POST create-blank-question', ok: createQRes.status === 200 && !!httpQId, id: httpQId });
    const updQRes = await qRequest
      .post('/update-question-field')
      .set('x-user-sub', qEducatorSub)
      .send({ id: httpQId, field: 'QuestionText', value: 'HTTP Self-test question?' });
    questionHttpRes.steps.push({ name: 'POST update-question-field', ok: updQRes.status === 200, id: httpQId });
    const optRes = await qRequest
      .post('/create-question-option')
      .set('x-user-sub', qEducatorSub)
      .send({ questionId: httpQId, userSub: qEducatorSub });
    httpOptId = optRes.body && optRes.body.optionId;
    questionHttpRes.steps.push({ name: 'POST create-question-option', ok: optRes.status === 200 && !!httpOptId, id: httpOptId });
    const updOptRes = await qRequest
      .post('/update-question-option')
      .set('x-user-sub', qEducatorSub)
      .send({ questionId: httpQId, optionId: httpOptId, text: 'Option A', rationale: 'Sample rationale' });
    questionHttpRes.steps.push({ name: 'POST update-question-option', ok: updOptRes.status === 200, id: httpOptId });
    const setCorrRes = await qRequest
      .post('/set-correct-option')
      .set('x-user-sub', qEducatorSub)
      .send({ questionId: httpQId, optionId: httpOptId });
    questionHttpRes.steps.push({ name: 'POST set-correct-option', ok: setCorrRes.status === 200, id: httpOptId });
    const listQRes = await qRequest
      .get('/my-questions')
      .set('x-user-sub', qEducatorSub);
    const listFound = Array.isArray(listQRes.body) && listQRes.body.some((q) => q.ID === httpQId);
    questionHttpRes.steps.push({ name: 'GET my-questions', ok: listQRes.status === 200 && listFound, sample: listQRes.body && listQRes.body.length, id: httpQId });
    const getQRes = await qRequest
      .get(`/get-question/${httpQId}`)
      .set('x-user-sub', qEducatorSub);
    questionHttpRes.steps.push({ name: 'GET get-question/:id', ok: getQRes.status === 200 && getQRes.body && getQRes.body.ID === httpQId, id: httpQId });
    const recAttRes = await qRequest
      .post('/record-question-attempt')
      .set('x-user-sub', qStudentSub)
      .send({ questionId: httpQId, selectedOptionId: httpOptId, timeTakenMs: 800 });
    questionHttpRes.steps.push({ name: 'POST record-question-attempt', ok: recAttRes.status === 200, id: httpQId });
    const studAttRes = await qRequest
      .get('/my-question-attempts')
      .set('x-user-sub', qStudentSub);
    const attFound = Array.isArray(studAttRes.body) && studAttRes.body.some((a) => a.questionId === httpQId);
    questionHttpRes.steps.push({ name: 'GET my-question-attempts', ok: studAttRes.status === 200 && attFound, sample: studAttRes.body && studAttRes.body.length, id: httpQId });
    const delQRes = await qRequest
      .post('/delete-question')
      .set('x-user-sub', qEducatorSub)
      .send({ id: httpQId });
    questionHttpRes.steps.push({ name: 'POST delete-question', ok: delQRes.status === 200, id: httpQId });
  } catch (err) {
    questionHttpRes.steps.push({ name: 'Question HTTP tests error', ok: false, error: err.message });
  } finally {
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
    const badgeApp = require('express')();
    badgeApp.use(require('express').json({ limit: '2mb' }));
    badgeApp.use('/', require('./badgeRoutes')); // Was ./src/routes/badgeRoutes
    const badgeReq = supertest(badgeApp);
    const healthRes = await badgeReq.get('/health');
    badgeHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });
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
    const charApp = require('express')();
    charApp.use(require('express').json({ limit: '2mb' }));
    charApp.use('/', require('./characterRoutes')); // Was ./src/routes/characterRoutes
    const charReq = supertest(charApp);
    const healthRes = await charReq.get('/health');
    characterHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });
    const charSub = `SELFTEST_CHAR_${ts}`;
    const charFile = `selftest_char_${ts}.png`;
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
    const charAllRes = await charReq.get('/GetAllCharacterData');
    characterHttpRes.steps.push({
      name: 'GET /GetAllCharacterData',
      ok: charAllRes.status === 200 && Array.isArray(charAllRes.body),
      sample: Array.isArray(charAllRes.body) ? charAllRes.body.length : 'err',
      id: charId
    });
    const charSingleRes = await charReq.get(`/GetCharacterData/${charId}`);
    characterHttpRes.steps.push({
      name: 'GET /GetCharacterData/:id',
      ok: charSingleRes.status === 200 && charSingleRes.body,
      id: charId
    });
    const updCharRes = await charReq
      .post('/update-character-field')
      .set('x-user-sub', charSub)
      .send({ id: charId, field: 'Title', value: 'Updated Character' });
    characterHttpRes.steps.push({ name: 'POST update-character-field', ok: updCharRes.status === 200, id: charId });
    const delCharRes = await charReq
      .post('/delete-character')
      .set('x-user-sub', charSub)
      .send({ ID: charId });
    characterHttpRes.steps.push({ name: 'POST delete-character', ok: delCharRes.status === 200, id: charId });
    await dbPromise.query('DELETE FROM Images WHERE id = ?', [charImageId]);
  } catch (err) {
    characterHttpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  }
  results.push(characterHttpRes);

  /* ---------- Backdrop Routes (HTTP) ---------- */
  const backdropHttpRes = { name: 'Backdrop Routes (HTTP)', steps: [] };
  try {
    const backApp = require('express')();
    backApp.use(require('express').json({ limit: '2mb' }));
    backApp.use('/', require('./backdropRoutes')); // Was ./src/routes/backdropRoutes
    const backReq = supertest(backApp);
    const healthRes = await backReq.get('/health');
    backdropHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });
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
    const instApp = require('express')();
    instApp.use(require('express').json({ limit: '2mb' }));
    instApp.use('/', require('./instructionRoutes')); // Was ./src/routes/instructionRoutes
    const instReq = supertest(instApp);
    const healthRes = await instReq.get('/health');
    instructionHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });
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
    const tagApp = require('express')();
    tagApp.use(require('express').json({ limit: '2mb' }));
    tagApp.use('/', require('./tagRoutes')); // Was ./src/routes/tagRoutes
    const tagReq = supertest(tagApp);
    const healthRes = await tagReq.get('/health');
    tagHttpRes.steps.push({
      name: 'GET /health',
      ok: healthRes.status === 200 && healthRes.body && healthRes.body.status === 'ok',
      sample: healthRes.body && healthRes.body.service,
      id: 0
    });
    const tagSub = `SELFTEST_TAG_${ts}`;
    await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, iseducator, creation_date) VALUES (?, ?, 1, NOW())', [tagSub, `${tagSub}@example.com`]);
    tagHttpRes.steps.push({ name: 'Seed educator user', ok: true, sample: tagSub, id: tagSub });
    const tagListBefore = await tagReq.get('/tags');
    tagHttpRes.steps.push({ name: 'GET /tags (before)', ok: tagListBefore.status === 200 && Array.isArray(tagListBefore.body), sample: tagListBefore.body.length, id: 1 });
    const tagName = `SelfTestTag_${ts}`;
    const createTagRes = await tagReq.post('/create-tag').set('x-user-sub', tagSub).send({ name: tagName });
    const newTagId = createTagRes.body && createTagRes.body.tagId;
    tagHttpRes.steps.push({ name: 'POST create-tag', ok: createTagRes.status === 200 && !!newTagId, id: newTagId });
    const tagListAfter = await tagReq.get('/tags');
    const foundTag = Array.isArray(tagListAfter.body) && tagListAfter.body.some(t => t.id === newTagId);
    tagHttpRes.steps.push({ name: 'GET /tags (after)', ok: tagListAfter.status === 200 && foundTag, sample: tagListAfter.body.length, id: newTagId });
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
    const legacyApp = require('express')();
    legacyApp.use(require('express').json({ limit: '2mb' }));
    legacyApp.use('/', require('./legacyRoutes')); // Was ./src/routes/legacyRoutes
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
  // This is distinct from Question Routes (HTTP)
  const questionOpRes = { name: 'Question Operations (non-HTTP)', steps: [] }; // Renamed from questionRes
  let questionId_ops; let optionId_ops; // Renamed
  try {
    questionId_ops = await questionOps.createBlankQuestion(userSub, null);
    questionOpRes.steps.push({ name: 'Create blank question', ok: !!questionId_ops, sample: 'blank', id: questionId_ops });
    await questionOps.updateQuestionField(questionId_ops, 'QuestionText', 'Self-test question?');
    questionOpRes.steps.push({ name: 'Update text', ok: true, sample: 'Self-test question?', id: questionId_ops });
    optionId_ops = await questionOps.createQuestionOption(questionId_ops, userSub);
    questionOpRes.steps.push({ name: 'Add option', ok: !!optionId_ops, sample: 'Option placeholder', id: optionId_ops });
    await questionOps.updateQuestionOption(optionId_ops, 'Option A', 'Because.', questionId_ops);
    await questionOps.setCorrectOption(questionId_ops, optionId_ops);
    questionOpRes.steps.push({ name: 'Set correct option', ok: true, sample: 'Option A', id: optionId_ops });
    const attempt = await questionOps.recordQuestionAttempt(questionId_ops, userSub, optionId_ops);
    questionOpRes.steps.push({ name: 'Record attempt', ok: attempt && attempt.isCorrect === 1, sample: 'Attempt Option A', id: attempt && (attempt.AttemptID || attempt.id || attempt.insertId) });
    const attempts = await questionOps.getAttemptsForUser(userSub, questionId_ops);
    questionOpRes.steps.push({ name: 'Fetch attempts', ok: Array.isArray(attempts) && attempts.length > 0, sample: 'All', id: questionId_ops });
  } catch (err) {
    questionOpRes.steps.push({ name: 'Error', ok: false, error: err.message });
  } finally {
    if (questionId_ops) {
      try { await questionOps.deleteQuestion(questionId_ops); } catch (_) { /* ignore */ }
    }
  }
  results.push(questionOpRes);

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
    const tmpDir = path.join(__dirname, '../../tmp_selftest_badges'); 
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const baseName = `selftest_${ts}`;
    const tmpPath = path.join(tmpDir, baseName);
    fs.writeFileSync(tmpPath, 'x');
    const reqMock = {
      file: { filename: baseName, path: tmpPath, destination: tmpDir, originalname: baseName + '.png' },
      body: { userSub }
    };
    const uploadResult = await new Promise((resolve) => {
      const resMock = {
        status: (code) => ({ json: (data) => resolve({ code, data }), send: (data) => resolve({ code, error: data }) }),
        json: (data) => resolve({ code: 200, data }),
        send: (msg) => resolve({ code: 200, error: msg })
      };
      BadgeUploadHandler(reqMock, resMock);
    });
    if (uploadResult.code === 200 && uploadResult.data && uploadResult.data.BadgeID) {
      imageRes.steps.push({ name: 'Badge upload', ok: true, sample: baseName + '.png', id: uploadResult.data.BadgeID });
      const BadgeID = uploadResult.data.BadgeID;
      try {
        await dbPromise.query('DELETE FROM Badges WHERE ID = ?', [BadgeID]);
        await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [baseName + '.png']);
      } catch (_) {}
      const savedFilePath = path.join(tmpDir, baseName + '.png');
      if (fs.existsSync(savedFilePath)) fs.unlinkSync(savedFilePath);
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
    const tmpDir = path.join(__dirname, '../../tmp_selftest_uploads'); 
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const writeTemp = (base) => {
      const p = path.join(tmpDir, base); fs.writeFileSync(p, 'x'); return p;
    };
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
    await runUpload('Character', CharacterUploadHandler, { title: 'SelfTest', description: '' }, 'CharacterID', async (d, base) => {
      await dbPromise.query('DELETE FROM CharacterModels WHERE ID = ?', [d.CharacterID]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });
    await runUpload('Backdrop', BackdropUploadHandler, { title: 'SelfTest', description: '' }, 'BackdropID', async (d, base) => {
      await dbPromise.query('DELETE FROM Backdrops WHERE ID = ?', [d.BackdropID]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });
    await runUpload('Instruction', InstructionUploadHandler, { title: 'SelfTest', description: '' }, 'InstructionID', async (d, base) => {
      await dbPromise.query('DELETE FROM StudentInstructions WHERE ID = ?', [d.InstructionID]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });
    const profileSub = `SELFTEST_PROFILE_${ts}`;
    const [profIns] = await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, creation_date) VALUES (?, ?, NOW())', [profileSub, `${profileSub}@example.com`]);
    const profileId = profIns.insertId;
    await runUpload('Profile', ProfileUploadHandler, { userId: profileId, userSub: profileSub }, 'imageUrl', async (_d, base) => {
      await dbPromise.query('DELETE FROM UserAccounts WHERE id = ?', [profileId]);
      await dbPromise.query('DELETE FROM Images WHERE FileNameServer = ?', [base + '.png']);
    });
    const encSub_upload = `SELFTEST_ENCUP_${ts}`; // Renamed
    const [encIns] = await dbPromise.query('INSERT INTO Encounters (_REC_Creation_User, _REC_Modification_User, IsRootEncounter) VALUES (?, ?, 0)', [encSub_upload, encSub_upload]);
    const encounterId_upload = encIns.insertId;
    await runUpload('Encounter', EncounterUploadHandler, {
      userSub: encSub_upload, EncounterID: encounterId_upload, EncountersField: 'ImageBackdrop', ImageType: 'ImageBackdrop'
    }, 'ID', async (d, base) => {
      await dbPromise.query('DELETE FROM Encounters WHERE ID = ?', [encounterId_upload]);
      await dbPromise.query('DELETE FROM Images WHERE ID = ?', [d.ID]);
    });
  } catch (err) {
    uploadRes.steps.push({ name: 'Block error', ok: false, error: err.message });
  }
  results.push(uploadRes);

  /* ---------- UserAccounts CRUD tests ---------- */
  const userRes = { name: 'UserAccounts CRUD', steps: [] };
  let newUserId;
  try {
    const uniqueSub = `SELFTEST_USERCRUD_${ts}`; // Made more unique
    const uniqueEmail = `selftest_usercrud_${ts}@example.com`;
    const insertSql = 'INSERT INTO UserAccounts (auth0_sub, email, creation_date) VALUES (?, ?, NOW())';
    const [insertRes] = await dbPromise.query(insertSql, [uniqueSub, uniqueEmail]);
    newUserId = insertRes.insertId;
    userRes.steps.push({ name: 'Create user', ok: !!newUserId, sample: uniqueEmail, id: newUserId });
    const [rows1] = await dbPromise.query('SELECT email FROM UserAccounts WHERE id = ?', [newUserId]);
    userRes.steps.push({ name: 'Fetch user', ok: rows1.length === 1 && rows1[0].email === uniqueEmail, sample: rows1[0] && rows1[0].email, id: newUserId });
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

  /* ---------- Converted Delete Endpoints ---------- */
  const delRes = { name: 'Converted DELETE Handlers (DB Ops)', steps: [] };
  try {
    const delCharacterId = (await dbPromise.query('SELECT ID FROM CharacterModels LIMIT 1'))[0]?.[0]?.ID;
    if(delCharacterId) await dbPromise.query('DELETE FROM CharacterModels WHERE ID = ?', [delCharacterId]);
    delRes.steps.push({ name: 'Delete CharacterModels row', ok: true, id: delCharacterId || -1 });

    const delBackdropId = (await dbPromise.query('SELECT ID FROM Backdrops LIMIT 1'))[0]?.[0]?.ID;
    if(delBackdropId) await dbPromise.query('DELETE FROM Backdrops WHERE ID = ?', [delBackdropId]);
    delRes.steps.push({ name: 'Delete Backdrops row', ok: true, id: delBackdropId || -1 });

    const delInstructionId = (await dbPromise.query('SELECT ID FROM StudentInstructions LIMIT 1'))[0]?.[0]?.ID;
    if(delInstructionId) await dbPromise.query('DELETE FROM StudentInstructions WHERE ID = ?', [delInstructionId]);
    delRes.steps.push({ name: 'Delete StudentInstructions row', ok: true, id: delInstructionId || -1 });
  } catch (outerErr) {
    delRes.steps.push({ name: 'Delete tests error', ok: false, error: outerErr.message });
  }
  results.push(delRes);

  /* ---------- Quick-Win Refactor Integrity ---------- */
  const refactorRes = { name: 'Quick-Win Integrity', steps: [] };
  try {
    let authModUtils; // Renamed
    try {
      authModUtils = require('../utils/auth'); // Path adjusted
      const ok = typeof authModUtils.isUserAdminBySub === 'function' && typeof authModUtils.isUserEducatorBySub === 'function';
      refactorRes.steps.push({ name: 'utils/auth exports functions', ok, sample: Object.keys(authModUtils).join(', '), id: ok ? 1:0 });
    } catch (err) {
      refactorRes.steps.push({ name: 'utils/auth load error', ok: false, error: err.message });
    }
    try {
      const adminFalse = await authModUtils.isUserAdminBySub('SELFTEST_NONEXISTENT');
      const eduFalse   = await authModUtils.isUserEducatorBySub('SELFTEST_NONEXISTENT');
      const ok = adminFalse === false && eduFalse === false;
      refactorRes.steps.push({ name: 'Role helpers default to false', ok, sample: `admin:${adminFalse}, educator:${eduFalse}`, id: 2 });
    } catch (err) {
      refactorRes.steps.push({ name: 'Role helper execution error', ok: false, error: err.message });
    }
    try {
      const asyncHandler = require('../utils/asyncHandler'); // Path adjusted
      let passedToNext = false;
      const wrapped = asyncHandler(async () => { throw new Error('boom'); });
      await new Promise((resolve) => {
        wrapped({}, {}, (err) => { passedToNext = err instanceof Error; resolve(); });
      });
      refactorRes.steps.push({ name: 'asyncHandler passes errors', ok: passedToNext, sample: passedToNext ? 'Error captured':'No error', id:3});
    } catch (err) {
      refactorRes.steps.push({ name: 'asyncHandler test error', ok: false, error: err.message });
    }
    try {
      const { setupImageRoutes } = require('../imageRoutes'); // Assuming imageRoutes.js is in project root -> ../
      const registered = [];
      const appStub = { post: (path) => registered.push(path) };
      setupImageRoutes(appStub);
      const expected = [
        '/images/uploads/encounters/', '/images/uploads/backdrops/', '/images/uploads/characters/',
        '/images/uploads/badges/', '/images/uploads/instructions/', '/images/uploads/profiles/'
      ];
      const missing = expected.filter(e => !registered.includes(e));
      refactorRes.steps.push({ name: 'imageRoutes registers POST endpoints', ok: missing.length === 0, sample: registered.join(', '), id: registered.length, error: missing.length ? 'Missing: ' + missing.join(', ') : undefined });
    } catch (err) {
      refactorRes.steps.push({ name: 'imageRoutes test error', ok: false, error: err.message });
    }
  } catch (outerErr) {
    refactorRes.steps.push({ name: 'Refactor test block error', ok: false, error: outerErr.message });
  }
  results.push(refactorRes);

  /* ---------- Uploads Health Route tests (from imageRoutes) ---------- */
  const uploadsHealthRes = { name: 'Uploads Health Route (HTTP)', steps: [] };
  try {
    const upApp = require('express')();
    upApp.use(require('express').json({ limit: '2mb' }));
    require('../imageRoutes').setupImageRoutes(upApp); // setupImageRoutes is expected to mount on the app directly
    const upReq = supertest(upApp);
    // Path depends on how setupImageRoutes sets up its health check.
    // Original test used /api/uploads/health. If setupImageRoutes prefixes, or if imageRoutes is normally mounted under /api/uploads...
    // Assuming imageRoutes might expose a /health relative to its mount.
    // If imageRoutes is mounted at `/api/uploads` in server.js, then `/api/uploads/health` is correct.
    // If setupImageRoutes itself adds /api/uploads, then just /health.
    // For now, using /api/uploads/health as per original, this test might need adjustment based on imageRoutes.
    const upHealth = await upReq.get('/api/uploads/health'); 
    uploadsHealthRes.steps.push({
      name: 'GET /api/uploads/health (from imageRoutes)',
      ok: upHealth.status === 200 && upHealth.body && upHealth.body.status === 'ok',
      sample: upHealth.body && upHealth.body.service,
      id: 0
    });
  } catch (err) {
    uploadsHealthRes.steps.push({ name: 'Uploads health test error', ok: false, error: err.message });
  }
  results.push(uploadsHealthRes);

  /* ---------- User Routes (HTTP) ---------- */
  const userHttpRes = { name: 'User API Routes (HTTP)', steps: [] }; // Clarified name
  let testUserId_userApi, testUserHttpSub_userApi; // Renamed
  try {
    const userApp = require('express')();
    userApp.use(require('express').json({ limit: '2mb' }));
    const usersApiRouter = require('./userRoutesApi.js'); 
    userApp.use('/', usersApiRouter); // Test this router mounted at root
    const userRequest = supertest(userApp);
    testUserHttpSub_userApi = `SELFTEST_USER_API_${ts}`;
    const testEmail = `${testUserHttpSub_userApi}@example.com`;

    const healthCheckRes = await userRequest.get('/health');
    userHttpRes.steps.push({ name: 'GET /health', ok: healthCheckRes.status === 200 && healthCheckRes.body && healthCheckRes.body.status === 'ok', sample: healthCheckRes.body && healthCheckRes.body.message, id: 'health' });
    
    const createUserRes = await userRequest
      .post('/') 
      .set('x-user-sub', testUserHttpSub_userApi)
      .send({ auth0_sub: testUserHttpSub_userApi, email: testEmail, display_name: 'HTTP Test User' });
    testUserId_userApi = createUserRes.body && createUserRes.body.id;
    userHttpRes.steps.push({ name: 'POST / (create/get user)', ok: (createUserRes.status === 201 || createUserRes.status === 200) && !!testUserId_userApi, sample: `User ID: ${testUserId_userApi}`, id: testUserId_userApi || 0 });

    if (testUserId_userApi) {
      const getUserByIdRes = await userRequest.get(`/${testUserId_userApi}`).set('x-user-sub', testUserHttpSub_userApi);
      userHttpRes.steps.push({ name: `GET /${testUserId_userApi}`, ok: getUserByIdRes.status === 200 && getUserByIdRes.body && getUserByIdRes.body.id === testUserId_userApi, sample: getUserByIdRes.body && getUserByIdRes.body.email, id: testUserId_userApi });
      const getMeRes = await userRequest.get('/me').set('x-user-sub', testUserHttpSub_userApi);
      userHttpRes.steps.push({ name: 'GET /me', ok: getMeRes.status === 200 && getMeRes.body && getMeRes.body.auth0_sub === testUserHttpSub_userApi, sample: getMeRes.body && getMeRes.body.email, id: getMeRes.body && getMeRes.body.id });
      const newBio = `Bio updated at ${ts}`;
      const updateUserRes = await userRequest.put(`/${testUserId_userApi}/profile`).set('x-user-sub', testUserHttpSub_userApi).send({ bio: newBio, display_name: 'HTTP Test User Updated' });
      userHttpRes.steps.push({ name: `PUT /${testUserId_userApi}/profile`, ok: updateUserRes.status === 200 && updateUserRes.body.current && updateUserRes.body.current.bio === newBio, sample: newBio, id: testUserId_userApi });
      const deleteUserRes = await userRequest.delete(`/${testUserId_userApi}`).set('x-user-sub', testUserHttpSub_userApi);
      userHttpRes.steps.push({ name: `DELETE /${testUserId_userApi}`, ok: deleteUserRes.status === 200, sample: `Deleted user ${testUserId_userApi}`, id: testUserId_userApi });
      if (deleteUserRes.status === 200) testUserId_userApi = null; 
    }
  } catch (err) {
    userHttpRes.steps.push({ name: 'User API HTTP Routes Error', ok: false, error: err.message });
  } finally {
    if (testUserId_userApi) await dbPromise.query('DELETE FROM UserAccounts WHERE id = ?', [testUserId_userApi]).catch(()=>{});
    if (testUserHttpSub_userApi) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [testUserHttpSub_userApi]).catch(()=>{});
  }
  results.push(userHttpRes);

  /* ---------- Message Routes (HTTP) ---------- */
  const messageHttpRes = { name: 'Message API Routes (HTTP)', steps: [] }; // Clarified
  let msgTestUserSub1, msgTestUserSub2, msgTestAdminSub, conversationId_msg; // Renamed
  try {
    const mainApiRouter = require('.'); // require('src/routes/index.js')
    const msgApp = require('express')();
    msgApp.use(require('express').json());
    msgApp.set('io', { emit: () => {}, to: () => ({ emit: () => {} }) }); 
    msgApp.use('/api', mainApiRouter); // Mount main API router at /api for testing message routes as they are (e.g. /api/messages/*)
    const msgRequest = supertest(msgApp);

    msgTestUserSub1 = `SELFTEST_MSG_USR1_${ts}`;
    msgTestUserSub2 = `SELFTEST_MSG_USR2_${ts}`;
    msgTestAdminSub = `SELFTEST_MSG_ADM_${ts}`;
    await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, display_name, creation_date) VALUES (?, ?, ?, NOW())', [msgTestUserSub1, `${msgTestUserSub1}@example.com`, 'Msg Test User 1']);
    await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, display_name, creation_date) VALUES (?, ?, ?, NOW())', [msgTestUserSub2, `${msgTestUserSub2}@example.com`, 'Msg Test User 2']);
    await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, display_name, isadmin, creation_date) VALUES (?, ?, ?, 1, NOW())', [msgTestAdminSub, `${msgTestAdminSub}@example.com`, 'Msg Test Admin']);
    messageHttpRes.steps.push({ name: 'Create test users', ok: true, sample: `${msgTestUserSub1}, ${msgTestAdminSub}` });

    const directConvoRes = await msgRequest.post('/api/messages/conversations/direct').set('x-user-sub', msgTestUserSub1).send({ userSubA: msgTestUserSub1, userSubB: msgTestUserSub2 });
    conversationId_msg = directConvoRes.body && directConvoRes.body.conversationId;
    messageHttpRes.steps.push({ name: 'POST /api/messages/conversations/direct', ok: directConvoRes.status === 200 && !!conversationId_msg, sample: `ConvoID: ${conversationId_msg}`, id: conversationId_msg });

    if (conversationId_msg) {
      const sendMessageRes = await msgRequest.post(`/api/messages/conversations/${conversationId_msg}/messages`).set('x-user-sub', msgTestUserSub1).send({ senderSub: msgTestUserSub1, body: 'Hello from self-test!' });
      const messageId = sendMessageRes.body && sendMessageRes.body.messageId;
      messageHttpRes.steps.push({ name: 'POST /api/messages/conversations/:id/messages', ok: sendMessageRes.status === 200 && !!messageId, sample: `MsgID: ${messageId}`, id: messageId });
      const getMessagesRes = await msgRequest.get(`/api/messages/conversations/${conversationId_msg}/messages`).set('x-user-sub', msgTestUserSub1);
      const foundMessage = getMessagesRes.status === 200 && Array.isArray(getMessagesRes.body) && getMessagesRes.body.some(m => m.id === messageId);
      messageHttpRes.steps.push({ name: 'GET /api/messages/conversations/:id/messages', ok: foundMessage, sample: `Found: ${foundMessage}`, id: conversationId_msg });
      if (messageId) {
        const markReadRes = await msgRequest.post(`/api/messages/conversations/${conversationId_msg}/read`).set('x-user-sub', msgTestUserSub2).send({ userSub: msgTestUserSub2, lastMessageId: messageId });
        messageHttpRes.steps.push({ name: 'POST /api/messages/conversations/:id/read', ok: markReadRes.status === 200 && markReadRes.body.success, sample: `Marked read by ${msgTestUserSub2}`, id: conversationId_msg });
      }
    }
    const getConversationsRes = await msgRequest.get('/api/messages/conversations').set('x-user-sub', msgTestUserSub1);
    const foundConvoInList = getConversationsRes.status === 200 && Array.isArray(getConversationsRes.body) && getConversationsRes.body.some(c => c.conversationId === conversationId_msg);
    messageHttpRes.steps.push({ name: 'GET /api/messages/conversations (user1)', ok: foundConvoInList, sample: `Found: ${foundConvoInList}`, id: msgTestUserSub1 });
    const systemMsgRes = await msgRequest.post('/api/messages/admin/system-messages').set('x-user-sub', msgTestAdminSub).send({ body: 'Admin self-test system message', groups: ['admins'] }); 
    messageHttpRes.steps.push({ name: 'POST /api/messages/admin/system-messages', ok: systemMsgRes.status === 200 && systemMsgRes.body.success && systemMsgRes.body.count > 0, sample: `Sent to ${systemMsgRes.body.count} user(s)`, id: 'admin_msg'});
  } catch (err) {
    messageHttpRes.steps.push({ name: 'Message API HTTP Routes Error', ok: false, error: err.message, id: 'error' });
  } finally {
    if (msgTestUserSub1) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [msgTestUserSub1]).catch(()=>{});
    if (msgTestUserSub2) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [msgTestUserSub2]).catch(()=>{});
    if (msgTestAdminSub) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [msgTestAdminSub]).catch(()=>{});
    if (conversationId_msg) {
        await dbPromise.query('DELETE FROM ConversationParticipants WHERE conversation_id = ?', [conversationId_msg]).catch(()=>{});
        await dbPromise.query('DELETE FROM Messages WHERE conversation_id = ?', [conversationId_msg]).catch(()=>{});
        await dbPromise.query('DELETE FROM Conversations WHERE id = ?', [conversationId_msg]).catch(()=>{});
    }
    messageHttpRes.steps.push({ name: 'Cleanup test data', ok: true, id: 'cleanup' });
  }
  results.push(messageHttpRes);

  /* ---------- Journal API Routes (HTTP) ---------- */
  const journalApiHttpRes = { name: 'Journal API Routes (HTTP)', steps: [] };
  let journalAdminSub, journalStudentSub, testPromptId_journalApi; // Renamed
  const journalTestTitle = `Journal API Self-Test Prompt ${Date.now()}`;
  const journalTestText = 'This is the text for the self-test journal prompt.';
  const journalStudentResponseText = 'This is the student\\\'s self-test response.';

  try {
    const journalApp = require('express')();
    journalApp.use(require('express').json());
    journalApp.set('io', { emit: () => {}, to: () => ({ emit: () => {} }) });
    const journalApiRouter = require('./journalRoutesApi.js');
    journalApp.use('/api/journal', journalApiRouter); // Test with its intended prefix
    const journalRequest = supertest(journalApp);
    const ts_journal_api = Date.now(); // Local ts

    journalAdminSub = `SELFTEST_JRNL_ADM_${ts_journal_api}`;
    journalStudentSub = `SELFTEST_JRNL_STU_${ts_journal_api}`;
    await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, display_name, isadmin, iseducator, creation_date) VALUES (?, ?, ?, 1, 1, NOW())', [journalAdminSub, `${journalAdminSub}@example.com`, 'Journal Test Admin']);
    await dbPromise.query('INSERT INTO UserAccounts (auth0_sub, email, display_name, creation_date) VALUES (?, ?, ?, NOW())', [journalStudentSub, `${journalStudentSub}@example.com`, 'Journal Test Student']);
    journalApiHttpRes.steps.push({ name: 'Create test users (admin & student)', ok: true, sample: `${journalAdminSub}, ${journalStudentSub}` });

    const createPromptRes = await journalRequest.post('/api/journal/prompts').set('x-user-sub', journalAdminSub).send({ title: journalTestTitle, promptText: journalTestText });
    testPromptId_journalApi = createPromptRes.body && createPromptRes.body.id;
    journalApiHttpRes.steps.push({ name: 'Admin: Create Prompt (POST /api/journal/prompts)', ok: createPromptRes.status === 200 && !!testPromptId_journalApi, sample: `Prompt ID: ${testPromptId_journalApi}`, id: testPromptId_journalApi || 'create_fail' });

    if (testPromptId_journalApi) {
      const getAllPromptsRes = await journalRequest.get('/api/journal/prompts').set('x-user-sub', journalAdminSub);
      const foundCreatedPrompt = getAllPromptsRes.status === 200 && Array.isArray(getAllPromptsRes.body) && getAllPromptsRes.body.some(p => p.id === testPromptId_journalApi && p.title === journalTestTitle);
      journalApiHttpRes.steps.push({ name: 'Admin: Get All Prompts (GET /api/journal/prompts)', ok: foundCreatedPrompt, sample: `Found created: ${foundCreatedPrompt}`, id: 'get_all' });
      const getOnePromptRes = await journalRequest.get(`/api/journal/prompts/${testPromptId_journalApi}`).set('x-user-sub', journalAdminSub);
      journalApiHttpRes.steps.push({ name: 'Admin/Student: Get One Prompt (GET /api/journal/prompts/:id)', ok: getOnePromptRes.status === 200 && getOnePromptRes.body && getOnePromptRes.body.id === testPromptId_journalApi && getOnePromptRes.body.title === journalTestTitle, sample: `Title: ${getOnePromptRes.body && getOnePromptRes.body.title}`, id: testPromptId_journalApi });
      const updatedTitle = `${journalTestTitle}_updated`;
      const updatePromptRes = await journalRequest.put(`/api/journal/prompts/${testPromptId_journalApi}`).set('x-user-sub', journalAdminSub).send({ title: updatedTitle, promptText: journalTestText });
      journalApiHttpRes.steps.push({ name: 'Admin: Update Prompt (PUT /api/journal/prompts/:id)', ok: updatePromptRes.status === 200, sample: `Updated to: ${updatedTitle}`, id: testPromptId_journalApi });
      const getUpdatedPromptRes = await journalRequest.get(`/api/journal/prompts/${testPromptId_journalApi}`).set('x-user-sub', journalAdminSub);
      if(!(getUpdatedPromptRes.status === 200 && getUpdatedPromptRes.body && getUpdatedPromptRes.body.title === updatedTitle)) journalApiHttpRes.steps.push({ name: 'Admin: Verify Update Prompt - FAILED CHECK', ok: false, sample: `Got: ${getUpdatedPromptRes.body?.title}`, id: testPromptId_journalApi });
      const releasePromptRes = await journalRequest.post('/api/journal/prompts/release').set('x-user-sub', journalAdminSub).send({ promptId: testPromptId_journalApi });
      journalApiHttpRes.steps.push({ name: 'Admin: Release Prompt (POST /api/journal/prompts/release)', ok: releasePromptRes.status === 200 && releasePromptRes.body && typeof releasePromptRes.body.releasedCount === 'number', sample: `Released to: ${releasePromptRes.body?.releasedCount}`, id: testPromptId_journalApi });
      const getMyPromptsRes = await journalRequest.get('/api/journal/my-prompts').set('x-user-sub', journalStudentSub);
      const studentSeesReleasedPrompt = getMyPromptsRes.status === 200 && Array.isArray(getMyPromptsRes.body) && getMyPromptsRes.body.some(p => p.id === testPromptId_journalApi);
      journalApiHttpRes.steps.push({ name: 'Student: Get My Prompts (GET /api/journal/my-prompts)', ok: studentSeesReleasedPrompt, sample: `Student sees prompt: ${studentSeesReleasedPrompt}`, id: journalStudentSub });
      const submitResponseRes = await journalRequest.post(`/api/journal/prompts/${testPromptId_journalApi}/response`).set('x-user-sub', journalStudentSub).send({ responseText: journalStudentResponseText });
      const responseCharCount = submitResponseRes.body && submitResponseRes.body.charCount;
      journalApiHttpRes.steps.push({ name: 'Student: Submit Response (POST /api/journal/prompts/:id/response)', ok: submitResponseRes.status === 200 && responseCharCount === journalStudentResponseText.length, sample: `Char count: ${responseCharCount}`, id: testPromptId_journalApi });
      const getMyResponseRes = await journalRequest.get(`/api/journal/prompts/${testPromptId_journalApi}/my-response`).set('x-user-sub', journalStudentSub);
      journalApiHttpRes.steps.push({ name: 'Student: Get My Response (GET /api/journal/prompts/:id/my-response)', ok: getMyResponseRes.status === 200 && getMyResponseRes.body && getMyResponseRes.body.responseText === journalStudentResponseText, sample: `Response text match: ${getMyResponseRes.body?.responseText === journalStudentResponseText}`, id: testPromptId_journalApi });
      const getStatsRes = await journalRequest.get(`/api/journal/prompts/${testPromptId_journalApi}/stats`).set('x-user-sub', journalAdminSub);
      const statFoundForStudent = getStatsRes.status === 200 && Array.isArray(getStatsRes.body) && getStatsRes.body.some(s => s.userSub === journalStudentSub && s.charCount === journalStudentResponseText.length);
      journalApiHttpRes.steps.push({ name: 'Admin: Get Prompt Stats (GET /api/journal/prompts/:id/stats)', ok: statFoundForStudent, sample: `Stat found for student: ${statFoundForStudent}`, id: testPromptId_journalApi });
      const getRecipientsRes = await journalRequest.get(`/api/journal/prompts/${testPromptId_journalApi}/recipients`).set('x-user-sub', journalAdminSub);
      const recipientFound = getRecipientsRes.status === 200 && Array.isArray(getRecipientsRes.body) && getRecipientsRes.body.length > 0;
      journalApiHttpRes.steps.push({ name: 'Admin: Get Prompt Recipients (GET /api/journal/prompts/:id/recipients)', ok: recipientFound, sample: `Recipients count: ${getRecipientsRes.body?.length}`, id: testPromptId_journalApi });
      const deletePromptRes = await journalRequest.delete(`/api/journal/prompts/${testPromptId_journalApi}`).set('x-user-sub', journalAdminSub);
      journalApiHttpRes.steps.push({ name: 'Admin: Delete Prompt (DELETE /api/journal/prompts/:id)', ok: deletePromptRes.status === 200, sample: `Deleted prompt ${testPromptId_journalApi}`, id: testPromptId_journalApi });
      if(deletePromptRes.status === 200) testPromptId_journalApi = null;
    }
  } catch (err) {
    journalApiHttpRes.steps.push({ name: 'Journal API Routes Error', ok: false, error: err.message, id: 'error_block' });
  } finally {
    if (testPromptId_journalApi) {
      try {
        await dbPromise.query('DELETE FROM journal_responses WHERE promptId = ?', [testPromptId_journalApi]);
        await dbPromise.query('DELETE FROM journal_access WHERE promptId = ?', [testPromptId_journalApi]);
        await dbPromise.query('DELETE FROM journal_prompts WHERE id = ?', [testPromptId_journalApi]);
      } catch (dbErr) { journalApiHttpRes.steps.push({ name: 'Cleanup prompt DB error', ok: false, error: dbErr.message, id: 'cleanup_prompt_err'});}
    }
    if (journalAdminSub) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [journalAdminSub]).catch(()=>{});
    if (journalStudentSub) await dbPromise.query('DELETE FROM UserAccounts WHERE auth0_sub = ?', [journalStudentSub]).catch(()=>{});
    journalApiHttpRes.steps.push({ name: 'Cleanup test data attempted', ok: true, id: 'cleanup_done' });
  }
  results.push(journalApiHttpRes);

  return results;
}

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

  const escape = (str) => (str || '').toString().replace(/[&<>\"\'\`]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"\'":'&#39;','\`':'&#96;'}[c]));

  const makeInner = (sections, outerIdx) => {
    if (!sections || sections.length === 0) return '<p>No tests in this category.</p>'; // Nicer message
    const innerBtns = sections.map((r,i)=>`<button class="tabbtn inner${outerIdx}-tabbtn${i===0?' active':''}" onclick="showInner(${outerIdx},${i},this)">${escape(r.name)}</button>`).join('');
    const innerSections = sections.map((r,i)=>{
      const rows = r.steps.map(s=>`<tr><td>${escape(s.name)}</td><td>${escape(s.sample)}</td><td>${escape(s.id)}</td><td class="${s.ok?'ok':'fail'}">${s.ok?'PASS':'FAIL'}</td><td>${escape(s.error)}</td></tr>`).join('');
      return `<div class="tabcontent inner${outerIdx}-tabcontent" style="display:${i===0?'block':'none'}"><h3>${escape(r.name)}</h3><table><thead><tr><th>Step</th><th>Sample Data</th><th>Result ID</th><th>Status</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    return `<div class="tabbar">${innerBtns}</div>${innerSections}`;
  };

  const dbHtml = makeInner(dbResults, 0);
  const routeHtml = makeInner(routeResults, 1);

  const script = `<script>
    function showOuter(idx, btn) {
      document.querySelectorAll('.outerTabContent').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.outerTabBtn').forEach(el => el.classList.remove('active'));
      document.getElementById('outerTab'+idx).style.display = 'block';
      btn.classList.add('active');
    }
    function showInner(outerIdx, innerIdx, btn) {
      const tabContents = btn.closest('.outerTabContent').querySelectorAll('.inner'+outerIdx+'-tabcontent');
      const tabButtons = btn.closest('.tabbar').querySelectorAll('.inner'+outerIdx+'-tabbtn');
      tabContents.forEach(el => el.style.display = 'none');
      tabButtons.forEach(el => el.classList.remove('active'));
      tabContents[innerIdx].style.display = 'block';
      btn.classList.add('active');
    }
    document.addEventListener('DOMContentLoaded', () => {
      const firstOuterBtn = document.querySelector('.outerTabBtn');
      if (firstOuterBtn) firstOuterBtn.click(); // Activate first outer tab

      // Activate first inner tab for DB results if present
      const firstInnerBtnDB = document.querySelector('#outerTab0 .inner0-tabbtn');
      if(firstInnerBtnDB) firstInnerBtnDB.click();
      
      // Activate first inner tab for Route results if present
      const firstInnerBtnRoute = document.querySelector('#outerTab1 .inner1-tabbtn');
      if(firstInnerBtnRoute) firstInnerBtnRoute.click();
    });
  </script>`;

  return `<!DOCTYPE html><html><head><title>Self-Test Results</title>${style}</head><body>
    <h1>Self-Test Execution Summary</h1>
    <div class="outerTabBar">
      <button class="outerTabBtn" onclick="showOuter(0, this)">Database/Operations Tests</button>
      <button class="outerTabBtn" onclick="showOuter(1, this)">HTTP Route Tests</button>
    </div>
    <div id="outerTab0" class="outerTabContent">${dbHtml}</div>
    <div id="outerTab1" class="outerTabContent">${routeHtml}</div>
    ${script}</body></html>`;
}

module.exports = {
  runOpsSelfTest,
  buildHtml
}; 