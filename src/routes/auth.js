const express = require('express');
const { auth } = require('express-openid-connect');

// NOTE:
// In the legacy implementation the Auth0 config was in the mega routes file.
// We keep the same defaults but allow override via environment variables so
// that production secrets are not hard-coded.
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH_SECRET || 'w5fSUgs8Pg%c$MVGpab5*Q44nN#3YXfvnPo%!byF8^uBhaBxBZ&SbAE7D%Q^Z96#U3b8ns',
  baseURL: process.env.AUTH_BASE_URL || 'https://www.viralvalor.com',
  clientID: process.env.AUTH_CLIENT_ID || '6MakL0x2tNBn7RzjETREKxyQu4aj4408',
  issuerBaseURL: process.env.AUTH_ISSUER_BASE_URL || 'https://dev-sygugfcjg34k0wee.us.auth0.com'
};

const router = express.Router();

// Mount the Auth0 helper – this automatically registers /login, /logout, etc.
router.use(auth(config));

// Simple uptime probe to check if the auth service is responsive.
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router; 