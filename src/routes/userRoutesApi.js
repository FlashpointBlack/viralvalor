const express = require('express');
const router = express.Router();
const { dbPromise } = require('../../db'); // Adjusted path
const { requiresAuth } = require('express-openid-connect'); // Assuming this is correctly pathed from root
const { 
    validateRequiredFields, 
    isValidFieldName, 
    handleErrorResponse,
    sanitizeValue 
} = require('../../utils'); // Adjusted path
const { storeUserDetails } = require('../../routesfunctions'); // Import storeUserDetails

// ---------------------------------------------------------------------------\n// Helper utility – executes a query using the promise-based pool and returns\n// only the rows (discarding \`fields\`).  This keeps the call-sites concise.\n// ---------------------------------------------------------------------------
async function runQuery(sql, params = []) {
    const [rows] = await dbPromise.query(sql, params);
    return rows;
}

// Health check endpoint (already existed, kept for consistency)
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'User API is healthy' });
});

// Get all users
router.get('/', async (req, res) => { // Path changed from /api/users to /
    const query = `
        SELECT id, sid, nickname, name, picture_url, updated_at, email, 
        email_verified, auth0_sub, display_name, creation_date, 
        profile_complete, isadmin, xp_points, level, streak_days,
        profile_visibility, last_seen, iseducator, total_logins, bio, location,
        theme, email_notifications
        FROM UserAccounts
        ORDER BY id DESC
    `;
    
    try {
        const results = await runQuery(query);
        res.json(results);
    } catch (err) {
        console.error('Database error details:', {
            message: err.message,
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            sqlMessage: err.sqlMessage
        });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get profile status for current authenticated user
router.get('/profile-status', async (req, res) => { // Path changed from /api/user/profile-status
    console.log('>>> ENTERED /api/users/profile-status handler in userRoutesApi.js');
    const auth0SubFromOIDC = (req.oidc && req.oidc.user && req.oidc.user.sub) ? req.oidc.user.sub : null;
    const auth0SubFromHeader = req.headers['x-user-sub'] || null;
    const auth0Sub = auth0SubFromOIDC || auth0SubFromHeader;
    
    console.log(`[/api/users/profile-status userRoutesApi] Determined requestSub. OIDC: ${auth0SubFromOIDC}, Header: ${auth0SubFromHeader}, Effective: ${auth0Sub}`);
    
    if (!auth0Sub) {
        return res.status(400).json({ error: 'Missing Auth0 user ID' });
    }
    
    const query = `
        SELECT profile_complete, isadmin
        FROM UserAccounts
        WHERE auth0_sub = ?
    `;
    
    try {
        const results = await runQuery(query, [auth0Sub]);
        if (results.length === 0) {
            console.log(`[profile-status] No DB row for ${auth0Sub}. Returning profileComplete: false.`);
            return res.json({ profileComplete: false, isAdmin: false });
        }

        res.json({
            profileComplete: results[0].profile_complete === 1,
            isAdmin: results[0].isadmin === 1
        });
    } catch (err) {
        console.error('Error checking profile status:', err);
        res.status(500).json({ error: 'Failed to check profile status' });
    }
});

// Get full user details for currently authenticated user ("me" endpoint)
router.get('/me', async (req, res) => { // Path changed from /api/user/me
    console.log('>>> ENTERED /api/users/me handler');
    const auth0SubFromOIDC = (req.oidc && req.oidc.user && req.oidc.user.sub) ? req.oidc.user.sub : null;
    const auth0SubFromHeader = req.headers['x-user-sub'] || null;
    const auth0Sub = auth0SubFromOIDC || auth0SubFromHeader;
    
    console.log(`[/api/users/me userRoutesApi] Determined requestSub. OIDC: ${auth0SubFromOIDC}, Header: ${auth0SubFromHeader}, Effective: ${auth0Sub}`);
    
    if (!auth0Sub) {
        return res.status(401).json({ error: 'Unauthorized: User sub not provided' });
    }

    const query = `
        SELECT id, sid, nickname, name, picture_url, email, email_verified,
               auth0_sub, display_name, creation_date, profile_complete, isadmin,
               xp_points, level, streak_days, last_seen, total_logins,
               theme, email_notifications, bio, location, profile_visibility
        FROM UserAccounts
        WHERE auth0_sub = ?
        LIMIT 1
    `;

    try {
        const results = await runQuery(query, [auth0Sub]);
        if (results.length === 0) {
            console.log(`[users/me] No DB row for ${auth0Sub}. Returning 404.`);
            return res.status(404).json({ error: 'User profile not found in DB.' });
        }
        const user = results[0];

        const now = new Date();
        const toMidnight = (d) => {
            const dt = new Date(d);
            dt.setHours(0, 0, 0, 0);
            return dt;
        };

        const lastSeenDate = user.last_seen ? new Date(user.last_seen) : null;
        const diffDays = lastSeenDate ? Math.floor((toMidnight(now) - toMidnight(lastSeenDate)) / (1000 * 60 * 60 * 24)) : null;

        let newStreak = user.streak_days || 0;
        let shouldIncrementLogin = false;

        if (lastSeenDate === null) {
            newStreak = 1;
            shouldIncrementLogin = true;
        } else if (diffDays === 0) {
            newStreak = user.streak_days || 1;
        } else if (diffDays === 1) {
            newStreak = (user.streak_days || 0) + 1;
            shouldIncrementLogin = true;
        } else if (diffDays > 1) {
            newStreak = 1;
            shouldIncrementLogin = true;
        }

        const updateFields = [ 'last_seen = NOW()', 'streak_days = ?' ];
        const updateValues = [ newStreak ];

        if (shouldIncrementLogin) {
            updateFields.push('total_logins = total_logins + 1');
        }
        updateValues.push(user.id);
        const updateSql = `UPDATE UserAccounts SET ${updateFields.join(', ')} WHERE id = ?`;

        try {
            await runQuery(updateSql, updateValues);
            user.streak_days = newStreak;
            user.last_seen = now.toISOString(); // ensure ISO string
            if (shouldIncrementLogin) {
                user.total_logins = (user.total_logins || 0) + 1;
            }
        } catch (updateErr) {
            console.error('Error updating streak / last_seen:', updateErr);
        }
        res.json(user);
    } catch (err) {
        console.error('Error fetching user details:', err);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// Get all public profiles (for browsing, limited results)
router.get('/public-profiles', async (req, res) => { // Path: /api/users/public-profiles
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const query = `
        SELECT id, display_name, bio, location, level, streak_days, xp_points, last_seen,
               isadmin, iseducator, picture_url
        FROM UserAccounts
        WHERE profile_visibility = 'public'
        ORDER BY display_name ASC
        LIMIT ? OFFSET ?
    `;
    try {
        const results = await runQuery(query, [limit, offset]);
        res.json(results);
    } catch (err) {
        console.error('Error fetching public profiles:', err);
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});

// Search for public profiles (only returns users with public visibility)
router.get('/public-profiles/search/:query', async (req, res) => { // Path: /api/users/public-profiles/search/:query
    const searchQuery = req.params.query;
    const query = `
        SELECT id, display_name, bio, location, level, streak_days, xp_points, last_seen,
               isadmin, iseducator, picture_url
        FROM UserAccounts
        WHERE (display_name LIKE ? OR location LIKE ? OR bio LIKE ?) 
          AND profile_visibility = 'public'
        ORDER BY display_name ASC
        LIMIT 20
    `;
    const searchPattern = `%${sanitizeValue(searchQuery)}%`;
    try {
        const results = await runQuery(query, [searchPattern, searchPattern, searchPattern]);
        res.json(results);
    } catch (err) {
        console.error('Error searching public profiles:', err);
        res.status(500).json({ error: 'Failed to search profiles' });
    }
});

// Search users by name, email, or display_name
router.get('/search/:query', async (req, res) => { // Path changed from /api/users/search/:query
    const searchQuery = req.params.query;
    const query = `
        SELECT id, sid, nickname, name, picture_url, updated_at, email, 
        email_verified, auth0_sub, display_name, creation_date, 
        profile_complete, isadmin
        FROM UserAccounts
        WHERE name LIKE ? OR email LIKE ? OR display_name LIKE ? OR nickname LIKE ?
        ORDER BY id DESC
    `;
    const searchPattern = `%${sanitizeValue(searchQuery)}%`;
    try {
        const results = await runQuery(query, [searchPattern, searchPattern, searchPattern, searchPattern]);
        res.json(results);
    } catch (err) {
        console.error('Error searching users:', err);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Filter users by admin status
router.get('/filter/admin/:status', async (req, res) => { // Path changed from /api/users/filter/admin/:status
    const adminStatus = req.params.status === 'true' ? 1 : 0;
    const query = `
        SELECT id, sid, nickname, name, picture_url, updated_at, email, 
        email_verified, auth0_sub, display_name, creation_date, 
        profile_complete, isadmin
        FROM UserAccounts
        WHERE isadmin = ?
        ORDER BY id DESC
    `;
    try {
        const results = await runQuery(query, [adminStatus]);
        res.json(results);
    } catch (err) {
        console.error('Error filtering users by admin status:', err);
        res.status(500).json({ error: 'Failed to filter users' });
    }
});

// Test endpoint (from original userRoutes.js, path adjusted)
router.get('/test-legacy-user-endpoint', (req, res) => { // Was /api/test, renamed for clarity
    res.json({ message: 'User API (migrated test endpoint) is working' });
});

// Migrated from routes.js: Get OIDC user profile object
router.get('/oidc-profile', requiresAuth(), (req, res) => {
    if (req.oidc && req.oidc.user) {
        res.status(200).json(req.oidc.user);
    } else {
        res.status(401).json({ error: 'User not authenticated' });
    }
});

// Fetch user display_name, id, picture_url by Auth0 sub
router.get('/by-sub/:sub', async (req, res) => { // Path changed from /api/user/by-sub/:sub
    const auth0Sub = req.params.sub;
    if (!auth0Sub) {
        return res.status(400).json({ error: 'Missing Auth0 sub parameter' });
    }
    const query = `SELECT id, COALESCE(display_name, nickname, name, email) AS display_name, picture_url FROM UserAccounts WHERE auth0_sub = ? LIMIT 1`;
    try {
        const results = await runQuery(query, [auth0Sub]);
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(results[0]);
    } catch (err) {
        console.error('Error fetching display_name by sub:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Fetch public-safe user profile by Auth0 sub (for presenter modal, etc.)
router.get('/profile/:sub', async (req, res) => { // Path changed from /api/user/profile/:sub
    const auth0Sub = req.params.sub;
    if (!auth0Sub) {
        return res.status(400).json({ error: 'Missing Auth0 sub parameter' });
    }
    const query = `
        SELECT id, display_name, bio, location, picture_url,
               nickname, name, xp_points, level, streak_days, last_seen,
               isadmin, iseducator
        FROM UserAccounts
        WHERE auth0_sub = ?
        LIMIT 1
    `;
    try {
        const results = await runQuery(query, [auth0Sub]);
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const row = results[0];
        const profile = {
            id: row.id,
            display_name: row.display_name || '',
            bio: row.bio || '',
            location: row.location || '',
            profile_image: row.picture_url || null,
            nickname: row.nickname || null,
            name: row.name || null,
            title: row.nickname || row.name || null, // Legacy field for some UI components
            organization: row.location || null, // Legacy field
            credentials: [] // Legacy field
        };
        res.json(profile);
    } catch (err) {
        console.error('Error fetching profile by sub:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Get single user by ID (includes badges)
router.get('/:id', async (req, res) => { // Path changed from /api/users/:id
    const userId = req.params.id;
    if (isNaN(userId) || parseInt(userId) <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    const userQuery = `
        SELECT id, sid, nickname, name, picture_url, updated_at, email, 
        email_verified, auth0_sub, display_name, creation_date, 
        profile_complete, isadmin, xp_points, level, streak_days,
        profile_visibility, last_seen, iseducator, total_logins, bio, location,
        theme, email_notifications
        FROM UserAccounts
        WHERE id = ?
    `;
    try {
        const userResults = await runQuery(userQuery, [userId]);
        if (userResults.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResults[0];
        const badgesQuery = `
            SELECT b.ID, b.Title, b.Description, b.Image, ub.date_earned,
            (SELECT FileNameServer FROM Images WHERE ID = b.Image) as BadgeFileName
            FROM UserBadges ub
            JOIN Badges b ON ub.badge_id = b.ID
            WHERE ub.user_id = ?
            ORDER BY ub.date_earned DESC
        `;
        try {
            const badgeResults = await runQuery(badgesQuery, [userId]);
            user.badges = badgeResults;
        } catch (badgeErr) {
            console.error('Error fetching user badges:', badgeErr);
            // Continue without badges if this fails
        }
        res.json(user);
    } catch (err) {
        console.error('Error fetching user by ID:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Create new user
router.post('/', async (req, res) => { // Path changed from /api/users
    const subFromBody   = req.body?.auth0_sub || null;
    const subFromOIDC   = (req.oidc && req.oidc.user && req.oidc.user.sub) || null;
    const subFromHeader = req.headers['x-user-sub'] || null;
    let resolvedSub = null;
    if (subFromBody && (subFromBody === subFromOIDC || subFromBody === subFromHeader)) {
        resolvedSub = subFromBody;
    } else if (subFromOIDC) {
        resolvedSub = subFromOIDC;
    } else if (subFromHeader) {
        resolvedSub = subFromHeader;
    }
    if (!resolvedSub) {
        return res.status(400).json({ error: 'Missing Auth0 sub – cannot create account without verified identity' });
    }
    const {
        sid = null, nickname = null, name = null, picture_url = null, email,
        email_verified = 0, display_name = null, profile_complete = 0, isadmin = 0
    } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Missing required field: email' });
    }
    const auth0_sub = resolvedSub;
    console.log(`[POST /api/users] Attempting to create user. Auth0_sub: ${auth0_sub}, email: ${email}`);
    const query = `
        INSERT INTO UserAccounts (
            sid, nickname, name, picture_url, email, email_verified, 
            auth0_sub, display_name, theme, creation_date, profile_complete, isadmin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
    `;
    const values = [
        sanitizeValue(sid), sanitizeValue(nickname), sanitizeValue(name), sanitizeValue(picture_url),
        sanitizeValue(email), email_verified ? 1 : 0, sanitizeValue(auth0_sub),
        sanitizeValue(display_name), sanitizeValue('light'), profile_complete ? 1 : 0, isadmin ? 1 : 0
    ];
    try {
        const insertResult = await runQuery(query, values);
        const createdRows = await runQuery('SELECT * FROM UserAccounts WHERE id = ?', [insertResult.insertId]);
        return res.status(201).json(createdRows[0]);
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            console.warn('[POST /api/users] Duplicate detected');
            try {
                if (auth0_sub) {
                    const rowsBySub = await runQuery('SELECT * FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [auth0_sub]);
                    if (rowsBySub.length) return res.status(200).json(rowsBySub[0]);
                }
                const rowsByEmail = await runQuery('SELECT * FROM UserAccounts WHERE email = ? LIMIT 1', [email]);
                if (rowsByEmail.length) {
                    const existing = rowsByEmail[0];
                    if (existing.auth0_sub && existing.auth0_sub !== auth0_sub) {
                        console.error(`[POST /api/users] Email ${email} already exists with a different Auth0 ID (${existing.auth0_sub}). Creation blocked.`);
                         return res.status(409).json({ error: 'User profile creation conflicted with existing data (email associated with different login). Please contact support.' });
                    }
                     // If auth0_sub matches or existing auth0_sub is null, it's likely the same user, return existing.
                    return res.status(200).json(existing);
                }
            } catch (lookupErr) {
                console.error('Lookup error after duplicate entry:', lookupErr);
                return res.status(500).json({ error: 'Database error while resolving duplicate user.' });
            }
            return res.status(409).json({ error: 'User creation failed due to duplication (unable to resolve).' });
        }
        console.error('Error creating user:', err);
        return res.status(500).json({ error: 'Failed to create user' });
    }
});

// Migrated from routes.js: Submit profile details
router.post('/submit-profile', requiresAuth(), async (req, res) => {
    const userDetails = req.oidc.user;
    const displayName = req.body.displayName;
    try {
        await storeUserDetails({
            sid: userDetails.sid,
            nickname: userDetails.nickname,
            name: userDetails.name,
            picture_url: null, // Per original logic, ignore Auth0-provided avatar here
            updated_at: userDetails.updated_at, // This might be Auth0's update timestamp
            email: userDetails.email,
            email_verified: userDetails.email_verified,
            auth0_sub: userDetails.sub,
            display_name: displayName
        });
        // The storeUserDetails in routesfunctions.js sets profile_complete = 1
        // Fetch the user from DB to confirm and return consistent data with /me or /:id
        const userQuery = `SELECT * FROM UserAccounts WHERE auth0_sub = ? LIMIT 1`;
        const updatedUser = await runQuery(userQuery, [userDetails.sub]);
        if (updatedUser.length) {
            res.status(200).json({ message: 'Profile stored successfully', user: updatedUser[0] });
        } else {
            res.status(200).json({ message: 'Profile stored successfully, but could not retrieve updated record.' });
        }
    } catch (error) {
        console.error('Error storing user details via /submit-profile:', error);
        res.status(500).json({ error: 'Internal Server Error while storing profile' });
    }
});

// Award XP to a user
router.post('/:id/award-xp', async (req, res) => { // Path: /api/users/:id/award-xp
    const userId = req.params.id;
    const { amount } = req.body;
    if (isNaN(userId) || parseInt(userId) <= 0) return res.status(400).json({ error: 'Invalid user ID' });
    if (amount === undefined || isNaN(amount)) return res.status(400).json({ error: 'Invalid or missing XP amount' });
    const xpToAdd = parseInt(amount);
    if (xpToAdd === 0 && amount !== 0) return res.status(400).json({ error: 'XP amount must be a valid number.'});


    try {
        const results = await runQuery('SELECT xp_points, level FROM UserAccounts WHERE id = ?', [userId]);
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const currentXP = results[0].xp_points || 0;
        // Ensure newXP is not less than 0 if xpToAdd is negative.
        const newXP = Math.max(0, currentXP + xpToAdd); 
        // Level calculation needs to be robust for negative XP too. Level should not decrease below 1.
        const newLevel = Math.max(1, Math.floor(newXP / 100) + 1); 

        const updateQuery = 'UPDATE UserAccounts SET xp_points = ?, level = ? WHERE id = ?';
        await runQuery(updateQuery, [newXP, newLevel, userId]);
        res.json({ userId: parseInt(userId), xp_points: newXP, level: newLevel });
    } catch (err) {
        console.error('Error updating XP:', err);
        res.status(500).json({ error: 'Database error while updating XP' });
    }
});

// Get badges for a user
router.get('/:id/badges', async (req, res) => { // Path: /api/users/:id/badges
    const userId = req.params.id;
    if (isNaN(userId) || parseInt(userId) <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    const query = `
        SELECT b.ID, b.Title, b.Description, b.Image, ub.date_earned,
        (SELECT FileNameServer FROM Images WHERE ID = b.Image) as BadgeFileName
        FROM UserBadges ub
        JOIN Badges b ON ub.badge_id = b.ID
        WHERE ub.user_id = ?
        ORDER BY ub.date_earned DESC
    `;
    try {
        const results = await runQuery(query, [userId]);
        res.json(results);
    } catch (err) {
        console.error('Error fetching user badges:', err);
        res.status(500).json({ error: 'Failed to fetch user badges' });
    }
});

// Award a badge to a user
router.post('/:id/badges', async (req, res) => { // Path: /api/users/:id/badges
    const userId = parseInt(req.params.id);
    const badge_id = parseInt(req.body.badge_id);
    if (!badge_id) return res.status(400).json({ error: 'Missing badge_id field' });
    if (isNaN(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user ID' });
    if (isNaN(badge_id) || badge_id <= 0) return res.status(400).json({ error: 'Invalid badge ID' });
    
    console.log(`Awarding badge ${badge_id} to user ${userId}`);
    const checkQuery = 'SELECT * FROM UserBadges WHERE user_id = ? AND badge_id = ?';
    try {
        const checkResults = await runQuery(checkQuery, [userId, badge_id]);
        if (checkResults.length > 0) {
            return res.status(409).json({ error: 'User already has this badge' });
        }
        const query = 'INSERT INTO UserBadges (user_id, badge_id, date_earned) VALUES (?, ?, NOW())';
        const result = await runQuery(query, [userId, badge_id]);
        const badgeQuery = `
            SELECT b.*, (SELECT FileNameServer FROM Images WHERE ID = b.Image) as BadgeFileName 
            FROM Badges b WHERE b.ID = ?`;
        const badgeResults = await runQuery(badgeQuery, [badge_id]);
        res.status(201).json({
            message: 'Badge awarded to user successfully',
            userBadgeId: result.insertId, // Changed from 'id' to avoid confusion
            badge: badgeResults[0]
        });
    } catch (err) {
        console.error('Error awarding badge to user:', err);
        res.status(500).json({ error: 'Failed to award badge to user' });
    }
});

// User preferences GET (non-authenticated, by ID)
router.get('/:id/preferences', async (req, res) => { // Path: /api/users/:id/preferences
    const userId = req.params.id;
    if (isNaN(userId) || parseInt(userId) <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    const query = `SELECT id, theme, email_notifications FROM UserAccounts WHERE id = ?`;
    try {
        const results = await runQuery(query, [userId]);
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(results[0]);
    } catch (err) {
        console.error('Error fetching preferences by ID:', err);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

// Update user (general admin update)
router.put('/:id', async (req, res) => { // Path changed from /api/users/:id
    const userId = req.params.id;
    if (isNaN(userId) || parseInt(userId) <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    try {
        const results = await runQuery('SELECT * FROM UserAccounts WHERE id = ?', [userId]);
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const {
            sid, nickname, name, picture_url, email, email_verified, auth0_sub, 
            display_name, profile_complete, isadmin, xp_points, level, streak_days,
            profile_visibility, iseducator, bio, location, theme, email_notifications
        } = req.body;
        const updates = [];
        const values = [];
        // Dynamically build SET clause
        if (sid !== undefined) { updates.push('sid = ?'); values.push(sanitizeValue(sid)); }
        if (nickname !== undefined) { updates.push('nickname = ?'); values.push(sanitizeValue(nickname)); }
        if (name !== undefined) { updates.push('name = ?'); values.push(sanitizeValue(name)); }
        if (picture_url !== undefined) { updates.push('picture_url = ?'); values.push(sanitizeValue(picture_url)); }
        if (email !== undefined) { updates.push('email = ?'); values.push(sanitizeValue(email)); }
        if (email_verified !== undefined) { updates.push('email_verified = ?'); values.push(email_verified ? 1 : 0); }
        if (auth0_sub !== undefined) { updates.push('auth0_sub = ?'); values.push(sanitizeValue(auth0_sub)); }
        if (display_name !== undefined) { updates.push('display_name = ?'); values.push(sanitizeValue(display_name)); }
        if (profile_complete !== undefined) { updates.push('profile_complete = ?'); values.push(profile_complete ? 1 : 0); }
        if (isadmin !== undefined) { updates.push('isadmin = ?'); values.push(isadmin ? 1 : 0); }
        if (xp_points !== undefined) { updates.push('xp_points = ?'); values.push(parseInt(xp_points) || 0); }
        if (level !== undefined) { updates.push('level = ?'); values.push(parseInt(level) || 1); }
        if (streak_days !== undefined) { updates.push('streak_days = ?'); values.push(parseInt(streak_days) || 0); }
        if (profile_visibility !== undefined) { updates.push('profile_visibility = ?'); values.push(sanitizeValue(profile_visibility)); }
        if (iseducator !== undefined) { updates.push('iseducator = ?'); values.push(iseducator ? 1 : 0); }
        if (bio !== undefined) { updates.push('bio = ?'); values.push(sanitizeValue(bio)); }
        if (location !== undefined) { updates.push('location = ?'); values.push(sanitizeValue(location)); }
        if (theme !== undefined) { updates.push('theme = ?'); values.push(sanitizeValue(theme)); }
        if (email_notifications !== undefined) { updates.push('email_notifications = ?'); values.push(email_notifications ? 1 : 0); }
        
        if (updates.length === 0) {
            // If no specific fields to update, but request is made, perhaps just touch updated_at
            // For now, require at least one field or return 400.
             const updatedUser = await runQuery('SELECT * FROM UserAccounts WHERE id = ?', [userId]);
             return res.json(updatedUser[0]); // Return current state if no changes
        }
        updates.push('updated_at = NOW()'); // Always update this
        const updateSql = `UPDATE UserAccounts SET ${updates.join(', ')} WHERE id = ?`;
        values.push(userId);
        await runQuery(updateSql, values);
        const updatedRows = await runQuery('SELECT * FROM UserAccounts WHERE id = ?', [userId]);
        return res.json(updatedRows[0]);
    } catch (err) {
        console.error('Error updating user (admin):', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// User profile self-update
// Consolidates /api/users/:id/profile and /api/user-profile/:id from original file
router.put('/:id/profile', async (req, res) => { // Path is now /api/users/:id/profile
    const userId = req.params.id;
    const auth0Sub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

    if (!auth0Sub) {
        return res.status(401).json({ error: 'Unauthorized – no user identification provided' });
    }
    if (isNaN(userId) || parseInt(userId) <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
        const userCheckResults = await runQuery('SELECT id, auth0_sub FROM UserAccounts WHERE id = ?', [userId]);
        if (userCheckResults.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const dbAuthSub = userCheckResults[0].auth0_sub;
        const normalizeSub = (sub) => {
            if (!sub) return '';
            const str = sub.toString();
            const pipeIndex = str.indexOf('|');
            return pipeIndex >= 0 ? str.slice(pipeIndex + 1) : str;
        };
        const coreDbSub = normalizeSub(dbAuthSub);
        const coreReqSub = normalizeSub(auth0Sub);
        const subsMatch = (dbAuthSub && (dbAuthSub === auth0Sub || coreDbSub === coreReqSub || (coreReqSub && coreDbSub && coreReqSub.startsWith(coreDbSub))));

        if (dbAuthSub && !subsMatch) {
             // Check if user is admin, if so, allow update.
            const adminCheck = await runQuery('SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? AND isadmin = 1', [auth0Sub]);
            if (!adminCheck.length) {
                return res.status(403).json({ error: 'Forbidden: You can only update your own profile unless you are an admin.' });
            }
            console.log(`Admin ${auth0Sub} is updating profile for user ${userId}`);
        }
        
        const attachSubAndContinue = async (next) => {
            if (!dbAuthSub && userCheckResults[0].id === parseInt(userId)) { // Ensure it's the correct user if sub is missing
                console.log(`Attaching current auth0_sub ${auth0Sub} to user ID ${userId} as it was missing.`);
                await runQuery('UPDATE UserAccounts SET auth0_sub = ? WHERE id = ?', [auth0Sub, userId]);
            }
            next();
        };

        const performProfileUpdate = async () => {
            const {
                display_name, bio, location, profile_visibility, 
                email_notifications, theme, profile_complete 
            } = req.body;
            const updates = [];
            const values = [];
            if (display_name !== undefined) { updates.push('display_name = ?'); values.push(sanitizeValue(display_name)); }
            if (bio !== undefined) { updates.push('bio = ?'); values.push(sanitizeValue(bio)); }
            if (location !== undefined) { updates.push('location = ?'); values.push(sanitizeValue(location)); }
            if (profile_visibility !== undefined) { updates.push('profile_visibility = ?'); values.push(sanitizeValue(profile_visibility)); }
            if (email_notifications !== undefined) { updates.push('email_notifications = ?'); values.push(email_notifications ? 1 : 0); }
            if (theme !== undefined) { updates.push('theme = ?'); values.push(sanitizeValue(theme)); }
            if (profile_complete !== undefined) { updates.push('profile_complete = ?'); values.push(profile_complete ? 1 : 0); }
            
            if (updates.length === 0) {
                 const currentData = await runQuery('SELECT * FROM UserAccounts WHERE id = ?', [userId]);
                 return res.json({ message: 'No fields to update', current: currentData[0] });
            }
            updates.push('updated_at = NOW()');
            const query = `UPDATE UserAccounts SET ${updates.join(', ')} WHERE id = ?`;
            values.push(userId);
            await runQuery(query, values);
            const fetchResults = await runQuery('SELECT * FROM UserAccounts WHERE id = ?', [userId]);
            if (fetchResults.length === 0) {
                return res.status(500).json({ message: 'Profile updated, but could not retrieve updated data.' });
            }
            res.json({ message: 'Profile updated successfully', current: fetchResults[0] });
        };
        await attachSubAndContinue(performProfileUpdate);
    } catch (err) {
        console.error('Error updating user profile (self):', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// User preferences PUT (non-authenticated, by ID)
// Consolidates /api/user-preferences/:id
router.put('/:id/preferences', async (req, res) => { // Path: /api/users/:id/preferences
    const userId = req.params.id;
    if (isNaN(userId) || parseInt(userId) <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    const { theme, email_notifications } = req.body;
    const updates = [];
    const values = [];
    if (theme !== undefined) { updates.push('theme = ?'); values.push(sanitizeValue(theme)); }
    if (email_notifications !== undefined) { updates.push('email_notifications = ?'); values.push(email_notifications ? 1 : 0); }
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No preference fields to update' });
    }
    updates.push('updated_at = NOW()');
    const query = `UPDATE UserAccounts SET ${updates.join(', ')} WHERE id = ?`;
    values.push(userId);
    try {
        const result = await runQuery(query, values);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found or no changes made' });
        }
        const results = await runQuery('SELECT id, theme, email_notifications FROM UserAccounts WHERE id = ?', [userId]);
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found after update' });
        }
        res.json({ 
            message: 'Preferences updated successfully',
            current: results[0]
        });
    } catch (err) {
        console.error('Error updating preferences by ID:', err);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

// Delete user
router.delete('/:id', async (req, res) => { // Path changed from /api/users/:id
    const userId = req.params.id;
    if (isNaN(userId) || parseInt(userId) <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    try {
        const rows = await runQuery('SELECT * FROM UserAccounts WHERE id = ?', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Consider related data: UserBadges, etc. For now, direct delete.
        await runQuery('DELETE FROM UserAccounts WHERE id = ?', [userId]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Remove a badge from a user
router.delete('/:userId/badges/:badgeId', async (req, res) => { // Path: /api/users/:userId/badges/:badgeId
    const userId = req.params.userId;
    const badgeId = req.params.badgeId;
    if (isNaN(userId) || parseInt(userId) <= 0) return res.status(400).json({ error: 'Invalid user ID' });
    if (isNaN(badgeId) || parseInt(badgeId) <= 0) return res.status(400).json({ error: 'Invalid badge ID' });
    const query = 'DELETE FROM UserBadges WHERE user_id = ? AND badge_id = ?';
    try {
        const result = await runQuery(query, [userId, badgeId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Badge not found for this user or already removed' });
        }
        res.json({ message: 'Badge removed from user successfully' });
    } catch (err) {
        console.error('Error removing badge from user:', err);
        res.status(500).json({ error: 'Failed to remove badge from user' });
    }
});

module.exports = router;

// Note: The endpoint /api/user-profile/:id (PUT) was consolidated into /:id/profile (PUT)
// The endpoint /api/user-preferences/:id (PUT) was consolidated into /:id/preferences (PUT)
// The endpoint /api/user-preferences/:id (GET) was consolidated into /:id/preferences (GET) 