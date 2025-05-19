// src/middleware/redirectShim.js

// Simple logger for redirect actions
const logRedirect = (originalUrl, newUrl) => {
  console.log(`[REDIRECT SHIM]: Redirecting ${originalUrl} to ${newUrl}`);
};

const legacyRedirects = [
  // Order can matter if prefixes overlap, but not in this specific set.
  // More specific paths should come before broader prefixes if they could conflict.
  { oldPath: '/users', newPrefix: '/api/users', isPrefix: true },
  { oldPath: '/messages', newPrefix: '/api/messages', isPrefix: true },
  { oldPath: '/journal', newPrefix: '/api/journal', isPrefix: true },
  // Specific self-test routes
  { oldPath: '/test-db', newPrefix: '/api/selftest/test-db', isPrefix: false },
  { oldPath: '/run-test', newPrefix: '/api/selftest/run-test', isPrefix: false },
  { oldPath: '/test-auth-ping', newPrefix: '/api/selftest/test-auth-ping', isPrefix: false },
  // Ad-hoc routes from server.js
  { oldPath: '/am-admin', newPrefix: '/api/am-admin', isPrefix: false },
  { oldPath: '/am-educator', newPrefix: '/api/am-educator', isPrefix: false },
];

function redirectShim(req, res, next) {
  for (const rule of legacyRedirects) {
    if (rule.isPrefix && req.path.startsWith(rule.oldPath)) {
      // Handle prefix-based redirects (e.g., /users/*)
      const remainingPath = req.path.substring(rule.oldPath.length);
      const newUrl = rule.newPrefix + remainingPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
      
      logRedirect(req.originalUrl, newUrl);
      res.setHeader('Deprecation', 'true');
      // According to SOW: "301 redirect middleware"
      return res.redirect(301, newUrl);
    } else if (!rule.isPrefix && req.path === rule.oldPath) {
      // Handle exact path redirects
      const newUrl = rule.newPrefix + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');

      logRedirect(req.originalUrl, newUrl);
      res.setHeader('Deprecation', 'true');
      return res.redirect(301, newUrl);
    }
  }

  // No legacy path matched, proceed to next middleware
  next();
}

module.exports = redirectShim; 