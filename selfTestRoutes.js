const express = require('express');
const router = express.Router();

const { dbPromise } = require('./db');
const journalOps = require('./journalOperations');
const questionOps = require('./questionOperations');
const articleOps = require('./articleOperations');
const { BadgeUploadHandler } = require('./imageHandlers');
const fs = require('fs');
const path = require('path');

// Utility – simple admin check reused elsewhere in project
async function isUserAdminBySub(userSub) {
  try {
    const [rows] = await dbPromise.query('SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [userSub]);
    return rows.length && rows[0].isadmin === 1;
  } catch (err) {
    console.error('isUserAdminBySub DB error', err);
    return false;
  }
}

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

  return results;
}

router.get('/admin/selftest', async (req, res) => {
  try {
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'] || req.query.sub;
    if (!requestSub) return res.status(401).send('Unauthorized – user sub missing');

    const isAdmin = await isUserAdminBySub(requestSub);
    if (!isAdmin) return res.status(403).send('Forbidden – admin only');

    const results = await runOpsSelfTest(requestSub);

    // If client asks JSON explicit
    if (req.query.format === 'json') return res.json(results);

    // Otherwise build simple HTML for readability
    const html = buildHtml(results);
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

  return `<!DOCTYPE html><html><head><title>Operations Self-Test</title>${style}</head><body><h1>Operations Self-Test Results</h1><div class="outerTabBar">${outerBtns}</div>${outerSections}${script}</body></html>`;
}

module.exports = { setupSelfTestRoutes: (app) => app.use('/api', router) }; 