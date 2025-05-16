const express = require('express');
const { db } = require('./db');
const { requiresAuth } = require('express-openid-connect');
const { 
    validateRequiredFields, 
    isValidFieldName, 
    handleErrorResponse,
    sanitizeValue 
} = require('./utils');

// User management routes
const setupUserRoutes = (app) => {
    // Get all users
    app.get('/api/users', (req, res) => {
        const query = `
            SELECT id, sid, nickname, name, picture_url, updated_at, email, 
            email_verified, auth0_sub, display_name, creation_date, 
            profile_complete, isadmin, xp_points, level, streak_days,
            profile_visibility, last_seen, iseducator, total_logins, bio, location,
            theme, email_notifications
            FROM UserAccounts
            ORDER BY id DESC
        `;
        
        db.query(query, (err, results) => {
            if (err) {
                console.error('Database error details:', {
                    message: err.message,
                    code: err.code,
                    errno: err.errno,
                    sqlState: err.sqlState,
                    sqlMessage: err.sqlMessage
                });
                return res.status(500).json({ error: 'Failed to fetch users' });
            }
            res.json(results);
        });
    });

    // Get profile status for current authenticated user
    app.get('/api/user/profile-status', (req, res) => {
        console.log('>>> ENTERED /api/user/profile-status handler in userRoutes.js');
        const auth0SubFromOIDC = (req.oidc && req.oidc.user && req.oidc.user.sub) ? req.oidc.user.sub : null;
        const auth0SubFromHeader = req.headers['x-user-sub'] || null;
        const auth0Sub = auth0SubFromOIDC || auth0SubFromHeader;
        
        console.log(`[/api/user/profile-status userRoutes] Determined requestSub. OIDC: ${auth0SubFromOIDC}, Header: ${auth0SubFromHeader}, Effective: ${auth0Sub}`);
        
        if (!auth0Sub) {
            return res.status(400).json({ error: 'Missing Auth0 user ID' });
        }
        
        const query = `
            SELECT profile_complete, isadmin
            FROM UserAccounts
            WHERE auth0_sub = ?
        `;
        
        db.query(query, [auth0Sub], (err, results) => {
            if (err) {
                console.error('Error checking profile status:', err);
                return res.status(500).json({ error: 'Failed to check profile status' });
            }
            
            if (results.length === 0) {
                // No DB user – DO NOT create one on-the-fly here.
                // Let the client-initiated POST /api/users handle explicit creation with its fresh authUser.sub.
                console.log(`[profile-status] No DB row for ${auth0Sub}. Returning profileComplete: false.`);
                return res.json({ profileComplete: false, isAdmin: false });
            } else {
                res.json({ 
                    profileComplete: results[0].profile_complete === 1,
                    isAdmin: results[0].isadmin === 1
                });
            }
        });
    });

    // Get single user by ID
    app.get('/api/users/:id', (req, res) => {
        const userId = req.params.id;
        
        // Validate user ID
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
        
        db.query(userQuery, [userId], (err, userResults) => {
            if (err) {
                console.error('Error fetching user:', err);
                return res.status(500).json({ error: 'Failed to fetch user' });
            }
            
            if (userResults.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const user = userResults[0];
            
            // Fetch user badges
            const badgesQuery = `
                SELECT b.ID, b.Title, b.Description, b.Image, ub.date_earned,
                (SELECT FileNameServer FROM Images WHERE ID = b.Image) as BadgeFileName
                FROM UserBadges ub
                JOIN Badges b ON ub.badge_id = b.ID
                WHERE ub.user_id = ?
                ORDER BY ub.date_earned DESC
            `;
            
            db.query(badgesQuery, [userId], (badgeErr, badgeResults) => {
                if (badgeErr) {
                    console.error('Error fetching user badges:', badgeErr);
                    // Return user without badges
                    return res.json(user);
                }
                
                // Add badges to user object
                user.badges = badgeResults;
                res.json(user);
            });
        });
    });

    // Create new user
    app.post('/api/users', (req, res) => {
        // Determine the canonical Auth0 sub for this request
        const subFromBody   = req.body?.auth0_sub || null;
        const subFromOIDC   = (req.oidc && req.oidc.user && req.oidc.user.sub) || null;
        const subFromHeader = req.headers['x-user-sub'] || null;

        // Prefer the body value when it matches either OIDC or header, else trust OIDC, else header.
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

        // Ensure we never rely on stale values stored in localStorage on the client.
        // We trust only the header/OIDC tokens passed with the current HTTPS request.

        // Extract and sanitize other fields from request body
        const {
            sid = null,
            nickname = null,
            name = null,
            picture_url = null,
            email,
            email_verified = 0,
            display_name = null,
            profile_complete = 0,
            isadmin = 0
        } = req.body;

        // Validate that email is provided
        if (!email) {
            return res.status(400).json({ error: 'Missing required field: email' });
        }

        const auth0_sub = resolvedSub; // canonical value to insert

        console.log(`[POST /api/users] Attempting to create user. Received auth0_sub in request body: ${auth0_sub}, email: ${email}`);

        const query = `
            INSERT INTO UserAccounts (
                sid, nickname, name, picture_url, 
                email, email_verified, auth0_sub, display_name, 
                theme, creation_date, profile_complete, isadmin
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
        `;
        
        const values = [
            sanitizeValue(sid),
            sanitizeValue(nickname),
            sanitizeValue(name),
            sanitizeValue(picture_url),
            sanitizeValue(email),
            email_verified ? 1 : 0,
            sanitizeValue(auth0_sub),
            sanitizeValue(display_name),
            sanitizeValue('light'), // default theme for new accounts
            profile_complete ? 1 : 0,
            isadmin ? 1 : 0
        ];
        
        db.query(query, values, (err, result) => {
            if (err) {
                // Handle duplicate entry (e.g., unique email or auth0_sub)
                if (err.code === 'ER_DUP_ENTRY') {
                    console.warn('[POST /api/users] Duplicate detected');

                    // 1. Attempt to fetch by auth0_sub (maybe user already exists)
                    if (auth0_sub) {
                        return db.query('SELECT * FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [auth0_sub], (selErr1, selRows1) => {
                            if (selErr1) {
                                console.error('Error fetching by sub after duplicate entry error during INSERT:', selErr1);
                                // If select fails, it's a server issue, not necessarily a conflict.
                                return res.status(500).json({ error: 'Database error while checking for existing user by Auth0 ID.' });
                            }

                            if (selRows1 && selRows1.length) {
                                // User with this auth0_sub already exists. This is the correct record.
                                console.log(`[POST /api/users] User with auth0_sub ${auth0_sub} already exists (ID: ${selRows1[0].id}). Returning existing record.`);
                                return res.status(200).json(selRows1[0]);
                            }

                            // No user found with this auth0_sub. The duplicate is therefore on some other unique key – very likely the email.

                            db.query('SELECT * FROM UserAccounts WHERE email = ? LIMIT 1', [email], (selErr2, selRows2) => {
                                if (selErr2) {
                                    console.error('Error fetching by email after duplicate entry error during INSERT:', selErr2);
                                    return res.status(500).json({ error: 'Database error while checking for existing user by email.' });
                                }

                                if (selRows2 && selRows2.length) {
                                    const existing = selRows2[0];

                                    // If a row with the same email exists but with a different auth0_sub, refuse to create.
                                    if (existing.auth0_sub && existing.auth0_sub !== auth0_sub) {
                                        console.error(`[POST /api/users] Email ${email} already exists with a different Auth0 ID (${existing.auth0_sub}). Creation blocked.`);
                                    }
                                    // No automatic repair – caller must resolve.
                                    console.error(`[POST /api/users] ER_DUP_ENTRY and unable to auto-repair. auth0_sub: ${auth0_sub}, email: ${email}`);
                                    return res.status(409).json({ error: 'User profile creation conflicted with existing data. Please contact support.' });
                                }
                            });
                        });
                    }

                    // ER_DUP_ENTRY but no auth0_sub was provided in the request (highly unlikely given client)
                    console.error('[POST /api/users] ER_DUP_ENTRY on INSERT, but no auth0_sub was in the request to check against.');
                    return res.status(409).json({ error: 'User creation failed due to a conflict and missing Auth0 ID in request.' });
                }

                console.error('Error creating user (not ER_DUP_ENTRY):', err);
                return res.status(500).json({ error: 'Failed to create user' });
            }
            
            // Fetch the newly created user to return
            db.query('SELECT * FROM UserAccounts WHERE id = ?', [result.insertId], (err2, results2) => {
                if (err2) {
                    console.error('Error fetching created user:', err2);
                    return res.status(201).json({ id: result.insertId, message: 'User created successfully' });
                }
                
                res.status(201).json(results2[0]);
            });
        });
    });

    // Update user
    app.put('/api/users/:id', (req, res) => {
        const userId = req.params.id;
        
        // Validate user ID
        if (isNaN(userId) || parseInt(userId) <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        // First check if user exists
        db.query('SELECT * FROM UserAccounts WHERE id = ?', [userId], (err, results) => {
            if (err) {
                console.error('Error checking user:', err);
                return res.status(500).json({ error: 'Failed to update user' });
            }
            
            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // User exists, proceed with update
            const {
                sid, 
                nickname, 
                name, 
                picture_url, 
                email, 
                email_verified, 
                auth0_sub, 
                display_name, 
                profile_complete, 
                isadmin,
                xp_points,
                level,
                streak_days,
                profile_visibility,
                iseducator,
                bio,
                location,
                theme,
                email_notifications
            } = req.body;
            
            // Build update query dynamically
            const updates = [];
            const values = [];
            
            if (sid !== undefined) {
                updates.push('sid = ?');
                values.push(sanitizeValue(sid));
            }
            
            if (nickname !== undefined) {
                updates.push('nickname = ?');
                values.push(sanitizeValue(nickname));
            }
            
            if (name !== undefined) {
                updates.push('name = ?');
                values.push(sanitizeValue(name));
            }
            
            if (picture_url !== undefined) {
                updates.push('picture_url = ?');
                values.push(sanitizeValue(picture_url));
            }
            
            if (email !== undefined) {
                updates.push('email = ?');
                values.push(sanitizeValue(email));
            }
            
            if (email_verified !== undefined) {
                updates.push('email_verified = ?');
                values.push(email_verified ? 1 : 0);
            }
            
            if (auth0_sub !== undefined) {
                updates.push('auth0_sub = ?');
                values.push(sanitizeValue(auth0_sub));
            }
            
            if (display_name !== undefined) {
                updates.push('display_name = ?');
                values.push(sanitizeValue(display_name));
            }
            
            if (profile_complete !== undefined) {
                updates.push('profile_complete = ?');
                values.push(profile_complete ? 1 : 0);
            }
            
            if (isadmin !== undefined) {
                updates.push('isadmin = ?');
                values.push(isadmin ? 1 : 0);
            }
            
            if (xp_points !== undefined) {
                updates.push('xp_points = ?');
                values.push(parseInt(xp_points) || 0);
            }
            
            if (level !== undefined) {
                updates.push('level = ?');
                values.push(parseInt(level) || 1);
            }
            
            if (streak_days !== undefined) {
                updates.push('streak_days = ?');
                values.push(parseInt(streak_days) || 0);
            }
            
            if (profile_visibility !== undefined) {
                updates.push('profile_visibility = ?');
                values.push(sanitizeValue(profile_visibility));
            }
            
            if (iseducator !== undefined) {
                updates.push('iseducator = ?');
                values.push(iseducator ? 1 : 0);
            }
            
            if (bio !== undefined) {
                updates.push('bio = ?');
                values.push(sanitizeValue(bio));
            }
            
            if (location !== undefined) {
                updates.push('location = ?');
                values.push(sanitizeValue(location));
            }
            
            if (theme !== undefined) {
                updates.push('theme = ?');
                values.push(sanitizeValue(theme));
            }
            
            if (email_notifications !== undefined) {
                updates.push('email_notifications = ?');
                values.push(email_notifications ? 1 : 0);
            }
            
            // Add updated_at timestamp
            updates.push('updated_at = NOW()');
            
            if (updates.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }
            
            const query = `UPDATE UserAccounts SET ${updates.join(', ')} WHERE id = ?`;
            values.push(userId);
            
            db.query(query, values, (err, result) => {
                if (err) {
                    console.error('Error updating user:', err);
                    return res.status(500).json({ error: 'Failed to update user' });
                }
                
                // Fetch the updated user to return
                db.query('SELECT * FROM UserAccounts WHERE id = ?', [userId], (err, results) => {
                    if (err) {
                        console.error('Error fetching updated user:', err);
                        return res.status(200).json({ message: 'User updated successfully' });
                    }
                    
                    res.json(results[0]);
                });
            });
        });
    });

    // Delete user
    app.delete('/api/users/:id', (req, res) => {
        const userId = req.params.id;
        
        // Validate user ID
        if (isNaN(userId) || parseInt(userId) <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        // Check if user exists
        db.query('SELECT * FROM UserAccounts WHERE id = ?', [userId], (err, results) => {
            if (err) {
                console.error('Error checking user:', err);
                return res.status(500).json({ error: 'Failed to delete user' });
            }
            
            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // User exists, proceed with deletion
            db.query('DELETE FROM UserAccounts WHERE id = ?', [userId], (err, result) => {
                if (err) {
                    console.error('Error deleting user:', err);
                    return res.status(500).json({ error: 'Failed to delete user' });
                }
                
                res.json({ message: 'User deleted successfully' });
            });
        });
    });

    // Search users by name, email, or display_name
    app.get('/api/users/search/:query', (req, res) => {
        const searchQuery = req.params.query;
        
        const query = `
            SELECT id, sid, nickname, name, picture_url, updated_at, email, 
            email_verified, auth0_sub, display_name, creation_date, 
            profile_complete, isadmin
            FROM UserAccounts
            WHERE 
                name LIKE ? OR 
                email LIKE ? OR 
                display_name LIKE ? OR
                nickname LIKE ?
            ORDER BY id DESC
        `;
        
        const searchPattern = `%${sanitizeValue(searchQuery)}%`;
        
        db.query(query, [searchPattern, searchPattern, searchPattern, searchPattern], (err, results) => {
            if (err) {
                console.error('Error searching users:', err);
                return res.status(500).json({ error: 'Failed to search users' });
            }
            
            res.json(results);
        });
    });

    // Search for public profiles (only returns users with public visibility)
    app.get('/api/public-profiles/search/:query', (req, res) => {
        const searchQuery = req.params.query;
        
        const query = `
            SELECT id, display_name, bio, location, level, streak_days, xp_points, last_seen,
                   isadmin, iseducator
            FROM UserAccounts
            WHERE 
                (display_name LIKE ? OR location LIKE ?) 
                AND profile_visibility = 'public'
            ORDER BY display_name ASC
            LIMIT 20
        `;
        
        const searchPattern = `%${sanitizeValue(searchQuery)}%`;
        
        db.query(query, [searchPattern, searchPattern], (err, results) => {
            if (err) {
                console.error('Error searching public profiles:', err);
                return res.status(500).json({ error: 'Failed to search profiles' });
            }
            
            res.json(results);
        });
    });

    // Get all public profiles (for browsing, limited results)
    app.get('/api/public-profiles', (req, res) => {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        
        // Only return basic info for public profiles
        const query = `
            SELECT id, display_name, bio, location, level, streak_days, xp_points, last_seen,
                   isadmin, iseducator
            FROM UserAccounts
            WHERE profile_visibility = 'public'
            ORDER BY display_name ASC
            LIMIT ? OFFSET ?
        `;
        
        db.query(query, [limit, offset], (err, results) => {
            if (err) {
                console.error('Error fetching public profiles:', err);
                return res.status(500).json({ error: 'Failed to fetch profiles' });
            }
            
            res.json(results);
        });
    });

    // Filter users by admin status
    app.get('/api/users/filter/admin/:status', (req, res) => {
        const adminStatus = req.params.status === 'true' ? 1 : 0;
        
        const query = `
            SELECT id, sid, nickname, name, picture_url, updated_at, email, 
            email_verified, auth0_sub, display_name, creation_date, 
            profile_complete, isadmin
            FROM UserAccounts
            WHERE isadmin = ?
            ORDER BY id DESC
        `;
        
        db.query(query, [adminStatus], (err, results) => {
            if (err) {
                console.error('Error filtering users by admin status:', err);
                return res.status(500).json({ error: 'Failed to filter users' });
            }
            
            res.json(results);
        });
    });

    // Get full user details for currently authenticated user
    app.get('/api/user/me', (req, res) => {
        console.log('>>> ENTERED /api/user/me handler');
        const auth0SubFromOIDC = (req.oidc && req.oidc.user && req.oidc.user.sub) ? req.oidc.user.sub : null;
        const auth0SubFromHeader = req.headers['x-user-sub'] || null;
        const auth0Sub = auth0SubFromOIDC || auth0SubFromHeader;
        
        console.log(`[/api/user/me userRoutes] Determined requestSub. OIDC: ${auth0SubFromOIDC}, Header: ${auth0SubFromHeader}, Effective: ${auth0Sub}`);
        
        if (!auth0Sub) {
            // Strictly require a user sub for this route
            return res.status(401).json({ error: 'Unauthorized: User sub not provided' });
        }

        const query = `
            SELECT id, sid, nickname, name, picture_url, email, email_verified,
                   auth0_sub, display_name, creation_date, profile_complete, isadmin,
                   xp_points, level, streak_days, last_seen, total_logins,
                   theme, email_notifications
            FROM UserAccounts
            WHERE auth0_sub = ?
            LIMIT 1
        `;

        db.query(query, [auth0Sub], (err, results) => {
            if (err) {
                console.error('Error fetching user details:', err);
                return res.status(500).json({ error: 'Failed to fetch user details' });
            }

            if (results.length === 0) {
                // No DB user – DO NOT create one on-the-fly here.
                // Let the client-initiated POST /api/users handle explicit creation with its fresh authUser.sub.
                // Return a 404 to signal to the client (e.g., UserProfile.js) that it needs to initiate creation.
                console.log(`[user/me] No DB row for ${auth0Sub}. Returning 404.`);
                return res.status(404).json({ error: 'User profile not found in DB.' });
            } else {
                const user = results[0];

                // --- Begin streak + last_seen handling ---------------------------------
                const now = new Date();

                // Helper: normalise a Date to midnight for *date*-only comparisons
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
                    // First ever login recorded
                    newStreak = 1;
                    shouldIncrementLogin = true;
                } else if (diffDays === 0) {
                    // Same calendar day – no streak change, no login increment
                    newStreak = user.streak_days || 1;
                } else if (diffDays === 1) {
                    // Consecutive day – increase streak
                    newStreak = (user.streak_days || 0) + 1;
                    shouldIncrementLogin = true;
                } else if (diffDays > 1) {
                    // Gap detected – reset streak
                    newStreak = 1;
                    shouldIncrementLogin = true;
                }

                // Build dynamic UPDATE query parts
                const updateFields = [ 'last_seen = NOW()', 'streak_days = ?' ];
                const updateValues = [ newStreak ];

                if (shouldIncrementLogin) {
                    updateFields.push('total_logins = total_logins + 1');
                }

                updateValues.push(user.id); // WHERE id = ?

                const updateSql = `UPDATE UserAccounts SET ${updateFields.join(', ')} WHERE id = ?`;

                db.query(updateSql, updateValues, (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating streak / last_seen:', updateErr);
                        // Even if the update fails, return the original user data to avoid blocking the client.
                        return res.json(user);
                    }

                    // Reflect changes in the response object
                    user.streak_days = newStreak;
                    user.last_seen = now;
                    if (shouldIncrementLogin) {
                        user.total_logins = (user.total_logins || 0) + 1;
                    }

                    res.json(user);
                });
                // --- End streak + last_seen handling -----------------------------------
            }
        });
    });

    // Fetch user display_name by Auth0 sub without requiring auth token
    // NOTE: This endpoint only returns display_name and id to minimise data exposure.
    app.get('/api/user/by-sub/:sub', (req, res) => {
        const auth0Sub = req.params.sub;

        if (!auth0Sub) {
            return res.status(400).json({ error: 'Missing Auth0 sub parameter' });
        }

        // Always provide a friendly display name; fall back to nickname → name → email if display_name is NULL.
        // Also include picture_url
        const query = `SELECT id, COALESCE(display_name, nickname, name, email) AS display_name, picture_url FROM UserAccounts WHERE auth0_sub = ? LIMIT 1`;

        db.query(query, [auth0Sub], (err, results) => {
            if (err) {
                console.error('Error fetching display_name by sub:', err);
                return res.status(500).json({ error: 'Failed to fetch user' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json(results[0]);
        });
    });

    // Test endpoint to verify API is working
    app.get('/api/test', (req, res) => {
        res.json({ message: 'API is working' });
    });

    // User profile update endpoint – accepts either Auth0 session (req.oidc.user) OR x-user-sub header.
    // This makes the endpoint usable from the SPA when the backend session cookie is missing.
    app.put('/api/users/:id/profile', (req, res) => {
        const userId = req.params.id;

        // Determine caller identity
        const auth0Sub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

        if (!auth0Sub) {
            return res.status(401).json({ error: 'Unauthorized – no user identification provided' });
        }

        // First, verify that the user is updating their own profile
        db.query('SELECT id, auth0_sub FROM UserAccounts WHERE id = ?', [userId], (err, results) => {
            if (err) {
                console.error('Error checking user:', err);
                return res.status(500).json({ error: 'Failed to update profile' });
            }
            
            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const dbAuthSub = results[0].auth0_sub;

            // Normalisation helper – strips common provider prefixes so that we can compare core IDs
            const normalizeSub = (sub) => {
                if (!sub) return '';
                const str = sub.toString();
                // Remove leading provider segment like "auth0|" or "google-oauth2|"
                const pipeIndex = str.indexOf('|');
                return pipeIndex >= 0 ? str.slice(pipeIndex + 1) : str;
            };

            const coreDbSub = normalizeSub(dbAuthSub);
            const coreReqSub = normalizeSub(auth0Sub);

            // Determine if the stored sub definitely matches the caller
            const subsMatch = (
                dbAuthSub && (
                    dbAuthSub === auth0Sub || // exact full match (with provider)
                    coreDbSub === coreReqSub || // match after normalisation
                    (coreReqSub && coreDbSub && coreReqSub.startsWith(coreDbSub)) // DB truncated prefix of the caller ID
                )
            );

            // If a non-empty sub exists in the DB but does NOT match the caller, forbid the update.
            if (dbAuthSub && !subsMatch) {
                return res.status(403).json({ error: 'You can only update your own profile' });
            }

            // Helper: if the DB row is missing auth0_sub, attach the caller's sub first, then continue.
            const attachSubAndContinue = (next) => {
                if (!dbAuthSub) {
                    db.query('UPDATE UserAccounts SET auth0_sub = ? WHERE id = ?', [auth0Sub, userId], (patchErr) => {
                        if (patchErr) {
                            console.error('Error attaching auth0_sub to user row:', patchErr);
                            return res.status(500).json({ error: 'Failed to link Auth0 account' });
                        }
                        next();
                    });
                } else {
                    next();
                }
            };

            // Encapsulate the remainder of the profile-update logic so we can call it after we possibly patched the row above.
            const performProfileUpdate = () => {
                // Filter allowed fields that a regular user can update
                const {
                    display_name,
                    bio,
                    location,
                    profile_visibility,
                    email_notifications,
                    theme,
                    profile_complete
                } = req.body;

                // Build update query dynamically with only allowed fields
                const updates = [];
                const values = [];

                if (display_name !== undefined) {
                    updates.push('display_name = ?');
                    values.push(sanitizeValue(display_name));
                }

                if (bio !== undefined) {
                    updates.push('bio = ?');
                    values.push(sanitizeValue(bio));
                }

                if (location !== undefined) {
                    updates.push('location = ?');
                    values.push(sanitizeValue(location));
                }

                if (profile_visibility !== undefined) {
                    updates.push('profile_visibility = ?');
                    values.push(sanitizeValue(profile_visibility));
                }

                if (email_notifications !== undefined) {
                    updates.push('email_notifications = ?');
                    values.push(email_notifications ? 1 : 0);
                }

                if (theme !== undefined) {
                    updates.push('theme = ?');
                    values.push(sanitizeValue(theme));
                }

                if (profile_complete !== undefined) {
                    updates.push('profile_complete = ?');
                    values.push(profile_complete ? 1 : 0);
                }

                // Add updated_at timestamp
                updates.push('updated_at = NOW()');

                if (updates.length === 0) {
                    return res.status(400).json({ error: 'No fields to update' });
                }

                const query = `UPDATE UserAccounts SET ${updates.join(', ')} WHERE id = ?`;
                values.push(userId);

                db.query(query, values, (err, result) => {
                    if (err) {
                        console.error('Error updating user profile:', err);
                        return res.status(500).json({ error: 'Failed to update profile' });
                    }

                    // Fetch the updated user to return all fields including profile_complete
                    db.query('SELECT * FROM UserAccounts WHERE id = ?', [userId], (fetchErr, fetchResults) => {
                        if (fetchErr || !fetchResults || fetchResults.length === 0) {
                            console.error('Error fetching updated user profile or user not found after update:', fetchErr);
                            return res.json({ 
                                message: 'Profile updated successfully, but could not retrieve updated data.',
                                // Provide the list of keys that were intended to be updated for client-side fallback if needed
                                updatedFields: Object.keys(req.body).filter(key => ['display_name', 'bio', 'location', 'profile_visibility', 'email_notifications', 'theme', 'profile_complete'].includes(key))
                            });
                        }

                        res.json({ 
                            message: 'Profile updated successfully',
                            current: fetchResults[0] // Return the full updated user object
                        });
                    });
                });
            };

            // Ensure sub is attached/patched only when safe, then run update logic.
            attachSubAndContinue(performProfileUpdate);
        });
    });

    // Alternative preferences endpoint that doesn't use requiresAuth
    app.put('/api/user-preferences/:id', (req, res) => {
        const userId = req.params.id;
        
        // Validate user ID
        if (isNaN(userId) || parseInt(userId) <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        // Only accept these specific preference fields
        const { theme, email_notifications } = req.body;
        
        console.log(`[Preferences] Updating for user ${userId}:`, { theme, email_notifications });
        
        // Build update query dynamically for preferences only
        const updates = [];
        const values = [];
        
        if (theme !== undefined) {
            updates.push('theme = ?');
            values.push(sanitizeValue(theme));
        }
        
        if (email_notifications !== undefined) {
            updates.push('email_notifications = ?');
            values.push(email_notifications ? 1 : 0);
        }
        
        // Nothing to update
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No preference fields to update' });
        }
        
        // Add updated_at timestamp
        updates.push('updated_at = NOW()');
        
        const query = `UPDATE UserAccounts SET ${updates.join(', ')} WHERE id = ?`;
        values.push(userId);
        
        console.log(`[Preferences] SQL Query: ${query}`);
        console.log(`[Preferences] Values:`, values);
        
        db.query(query, values, (err, result) => {
            if (err) {
                console.error('Error updating preferences:', err);
                return res.status(500).json({ error: 'Failed to update preferences' });
            }
            
            console.log(`[Preferences] Update result:`, result);
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found or no changes made' });
            }
            
            // Fetch the updated user to verify changes
            db.query('SELECT id, theme, email_notifications FROM UserAccounts WHERE id = ?', [userId], (err, results) => {
                if (err) {
                    console.error('Error fetching updated preferences:', err);
                    return res.status(200).json({ 
                        message: 'Preferences may have been updated, but verification failed',
                        updated: result.affectedRows > 0
                    });
                }
                
                if (results.length === 0) {
                    return res.status(404).json({ error: 'User not found after update' });
                }
                
                // Return the current preference values for verification
                res.json({ 
                    message: 'Preferences updated successfully',
                    updatedFields: Object.keys(req.body),
                    current: {
                        theme: results[0].theme,
                        email_notifications: results[0].email_notifications
                    }
                });
            });
        });
    });
    
    // Get badges for a user
    app.get('/api/users/:id/badges', (req, res) => {
        const userId = req.params.id;
        
        // Validate user ID
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
        
        db.query(query, [userId], (err, results) => {
            if (err) {
                console.error('Error fetching user badges:', err);
                return res.status(500).json({ error: 'Failed to fetch user badges' });
            }
            
            res.json(results);
        });
    });
    
    // Award a badge to a user
    app.post('/api/users/:id/badges', (req, res) => {
        const userId = parseInt(req.params.id);
        const badge_id = parseInt(req.body.badge_id);
        
        // Validate required fields
        if (!badge_id) {
            return res.status(400).json({ error: 'Missing badge_id field' });
        }
        
        // Validate user ID and badge ID
        if (isNaN(userId) || userId <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        if (isNaN(badge_id) || badge_id <= 0) {
            return res.status(400).json({ error: 'Invalid badge ID' });
        }
        
        console.log(`Awarding badge ${badge_id} to user ${userId}`);
        
        // Check if user already has this badge
        const checkQuery = 'SELECT * FROM UserBadges WHERE user_id = ? AND badge_id = ?';
        
        db.query(checkQuery, [userId, badge_id], (checkErr, checkResults) => {
            if (checkErr) {
                console.error('Error checking user badge:', checkErr);
                return res.status(500).json({ error: 'Failed to check if user has badge' });
            }
            
            if (checkResults.length > 0) {
                return res.status(409).json({ error: 'User already has this badge' });
            }
            
            // Award the badge
            const query = 'INSERT INTO UserBadges (user_id, badge_id, date_earned) VALUES (?, ?, NOW())';
            
            db.query(query, [userId, badge_id], (err, result) => {
                if (err) {
                    console.error('Error awarding badge to user:', err);
                    return res.status(500).json({ error: 'Failed to award badge to user' });
                }
                
                // Fetch the badge details to return
                const badgeQuery = `
                    SELECT b.*, (SELECT FileNameServer FROM Images WHERE ID = b.Image) as BadgeFileName 
                    FROM Badges b 
                    WHERE b.ID = ?
                `;
                
                db.query(badgeQuery, [badge_id], (badgeErr, badgeResults) => {
                    if (badgeErr || badgeResults.length === 0) {
                        return res.status(201).json({ 
                            message: 'Badge awarded to user successfully',
                            id: result.insertId
                        });
                    }
                    
                    res.status(201).json({
                        message: 'Badge awarded to user successfully',
                        id: result.insertId,
                        badge: badgeResults[0]
                    });
                });
            });
        });
    });
    
    // Remove a badge from a user
    app.delete('/api/users/:userId/badges/:badgeId', (req, res) => {
        const userId = req.params.userId;
        const badgeId = req.params.badgeId;
        
        // Validate IDs
        if (isNaN(userId) || parseInt(userId) <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        if (isNaN(badgeId) || parseInt(badgeId) <= 0) {
            return res.status(400).json({ error: 'Invalid badge ID' });
        }
        
        const query = 'DELETE FROM UserBadges WHERE user_id = ? AND badge_id = ?';
        
        db.query(query, [userId, badgeId], (err, result) => {
            if (err) {
                console.error('Error removing badge from user:', err);
                return res.status(500).json({ error: 'Failed to remove badge from user' });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Badge not found for this user' });
            }
            
            res.json({ message: 'Badge removed from user successfully' });
        });
    });

    // Alternative profile update endpoint that doesn't use requiresAuth
    app.put('/api/user-profile/:id', (req, res) => {
        const userId = req.params.id;
        
        // Validate user ID
        if (isNaN(userId) || parseInt(userId) <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        // Only accept these specific user profile fields
        const {
            display_name,
            bio,
            location,
            profile_visibility
        } = req.body;
        
        console.log(`[Profile] Updating for user ${userId}:`, { 
            display_name, bio, location, profile_visibility 
        });
        
        // Build update query dynamically with only allowed fields
        const updates = [];
        const values = [];
        
        if (display_name !== undefined) {
            updates.push('display_name = ?');
            values.push(sanitizeValue(display_name));
        }
        
        if (bio !== undefined) {
            updates.push('bio = ?');
            values.push(sanitizeValue(bio));
        }
        
        if (location !== undefined) {
            updates.push('location = ?');
            values.push(sanitizeValue(location));
        }
        
        if (profile_visibility !== undefined) {
            updates.push('profile_visibility = ?');
            values.push(sanitizeValue(profile_visibility));
        }
        
        // Nothing to update
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No profile fields to update' });
        }
        
        // Add updated_at timestamp
        updates.push('updated_at = NOW()');
        
        const query = `UPDATE UserAccounts SET ${updates.join(', ')} WHERE id = ?`;
        values.push(userId);
        
        console.log(`[Profile] SQL Query: ${query}`);
        console.log(`[Profile] Values:`, values);
        
        db.query(query, values, (err, result) => {
            if (err) {
                console.error('Error updating profile:', err);
                return res.status(500).json({ error: 'Failed to update profile' });
            }
            
            console.log(`[Profile] Update result:`, result);
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found or no changes made' });
            }
            
            // Fetch the updated user to verify changes
            db.query(
                `SELECT id, display_name, bio, location, profile_visibility 
                 FROM UserAccounts WHERE id = ?`, 
                [userId], 
                (err, results) => {
                    if (err) {
                        console.error('Error fetching updated profile:', err);
                        return res.status(200).json({ 
                            message: 'Profile may have been updated, but verification failed',
                            updated: result.affectedRows > 0
                        });
                    }
                    
                    if (results.length === 0) {
                        return res.status(404).json({ error: 'User not found after update' });
                    }
                    
                    // Return the current profile values for verification
                    res.json({ 
                        message: 'Profile updated successfully',
                        updatedFields: Object.keys(req.body).filter(key => 
                            ['display_name', 'bio', 'location', 'profile_visibility'].includes(key)
                        ),
                        current: results[0]
                    });
                }
            );
        });
    });

    // Non-authenticated endpoint to get user preferences
    app.get('/api/user-preferences/:id', (req, res) => {
        const userId = req.params.id;
        
        // Validate user ID
        if (isNaN(userId) || parseInt(userId) <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        console.log(`[Preferences] Fetching for user ${userId}`);
        
        // Query only preference-related fields
        const query = `
            SELECT id, theme, email_notifications
            FROM UserAccounts 
            WHERE id = ?
        `;
        
        db.query(query, [userId], (err, results) => {
            if (err) {
                console.error('Error fetching preferences:', err);
                return res.status(500).json({ error: 'Failed to fetch preferences' });
            }
            
            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const preferences = results[0];
            console.log(`[Preferences] Found for user ${userId}:`, preferences);
            
            // Return user preference data
            res.json(preferences);
        });
    });

    // Award XP to a user
    app.post('/api/users/:id/award-xp', (req, res) => {
        const userId = req.params.id;
        const { amount } = req.body; // amount of XP to add

        // Basic validation
        if (isNaN(userId) || parseInt(userId) <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        if (amount === undefined || isNaN(amount)) {
            return res.status(400).json({ error: 'Invalid or missing XP amount' });
        }

        const xpToAdd = parseInt(amount);
        if (xpToAdd === 0) {
            return res.status(400).json({ error: 'XP amount must be non-zero' });
        }

        // Fetch current XP to calculate new totals
        db.query('SELECT xp_points FROM UserAccounts WHERE id = ?', [userId], (err, results) => {
            if (err) {
                console.error('Error fetching user XP:', err);
                return res.status(500).json({ error: 'Database error while fetching XP' });
            }
            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const currentXP = results[0].xp_points || 0;
            const newXP = currentXP + xpToAdd;
            const newLevel = Math.floor(newXP / 100) + 1; // Simple level progression

            const updateQuery = 'UPDATE UserAccounts SET xp_points = ?, level = ? WHERE id = ?';
            db.query(updateQuery, [newXP, newLevel, userId], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating XP:', updateErr);
                    return res.status(500).json({ error: 'Database error while updating XP' });
                }

                // Return the updated values
                res.json({ userId: parseInt(userId), xp_points: newXP, level: newLevel });
            });
        });
    });

    app.get('/api/user/profile/:sub', (req, res) => {
        const auth0Sub = req.params.sub;

        if (!auth0Sub) {
            return res.status(400).json({ error: 'Missing Auth0 sub parameter' });
        }

        /*
         * We purposefully return a limited, public-safe subset of profile data.
         * If additional privacy rules are required (e.g. respecting profile_visibility),
         * they can be added here. For now this endpoint mirrors the data shown in
         * the "Find Players" feature and augments it with an avatar URL so that
         * the mobile presenter modal can display a profile picture.
         */
        const query = `
            SELECT id, display_name, bio, location, picture_url,
                   nickname, name, xp_points, level, streak_days, last_seen,
                   isadmin, iseducator
            FROM UserAccounts
            WHERE auth0_sub = ?
            LIMIT 1
        `;

        db.query(query, [auth0Sub], (err, results) => {
            if (err) {
                console.error('Error fetching profile by sub:', err);
                return res.status(500).json({ error: 'Failed to fetch profile' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const row = results[0];

            // Map DB fields to a shape expected by the front-end modal
            const profile = {
                id: row.id,
                // Always use the explicit display_name stored in the DB
                display_name: row.display_name || '',
                bio: row.bio || '',
                location: row.location || '',
                // Use picture_url as the avatar image. (The front-end expects profile_image)
                profile_image: row.picture_url || null,
                // Optionally surface nickname/name as separate fields if callers need them
                nickname: row.nickname || null,
                name: row.name || null,
                title: row.nickname || row.name || null,
                organization: row.location || null,
                credentials: []
            };

            res.json(profile);
        });
    });
};

module.exports = { setupUserRoutes }; 