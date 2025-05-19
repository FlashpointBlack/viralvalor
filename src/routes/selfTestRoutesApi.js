const express = require('express');
const router = express.Router();
const { runOpsSelfTest, buildHtml } = require('./selfTestUtils');
const { isUserAdminBySub } = require('../../utils/auth');
const path = require('path'); // Required by selfTestUtils for __dirname if not already there
const fs = require('fs'); // Required by selfTestUtils

// Main self-test route, will be mounted at /api/selftest/
router.get('/', async (req, res) => {
  try {
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'] || req.query.sub;
    if (!requestSub) return res.status(401).send('Unauthorized – user sub missing');

    const isAdmin = await isUserAdminBySub(requestSub);
    if (!isAdmin) return res.status(403).send('Forbidden – admin only');

    // __dirname in selfTestUtils will be src/routes. If it needs project root for tmp dirs,
    // it has been adjusted to use path.resolve(__dirname, '../..')
    const results = await runOpsSelfTest(requestSub); // userSub is passed here

    // Split into DB-focused and Route-focused result sets so the UI
    // can display them under the correct outer tab.
    // Adjusted to include 'API Routes' as a category for route tests
    const routeResults = results.filter(r => /Routes/i.test(r.name) || /API Routes/i.test(r.name));
    const dbResults    = results.filter(r => !(/Routes/i.test(r.name) || /API Routes/i.test(r.name)));

    if (req.query.format === 'json') return res.json(results);

    const html = buildHtml(dbResults, routeResults);
    res.set('Content-Type', 'text/html').send(html);
  } catch (err) {
    console.error('Self-test API error:', err);
    res.status(500).send('Server error running self-tests from API');
  }
});

// Add other self-test routes here

module.exports = router; 