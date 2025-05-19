const { dbPromise } = require('../db');

// ---------------------------------------------------------------------------
// Centralised role-lookup helpers – imported across the codebase.
// Each returns a boolean and NEVER throws, so callers can await safely.
// ---------------------------------------------------------------------------
async function isUserAdminBySub(userSub) {
  if (!userSub) return false;
  try {
    const [rows] = await dbPromise.query(
      'SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? LIMIT 1',
      [userSub]
    );
    return rows.length > 0 && Number(rows[0].isadmin) === 1;
  } catch (err) {
    console.error('[isUserAdminBySub] DB error', err);
    return false;
  }
}

async function isUserEducatorBySub(userSub) {
  if (!userSub) return false;
  try {
    const [rows] = await dbPromise.query(
      'SELECT iseducator FROM UserAccounts WHERE auth0_sub = ? LIMIT 1',
      [userSub]
    );
    return rows.length > 0 && Number(rows[0].iseducator) === 1;
  } catch (err) {
    console.error('[isUserEducatorBySub] DB error', err);
    return false;
  }
}

module.exports = {
  isUserAdminBySub,
  isUserEducatorBySub
}; 