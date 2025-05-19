// my includes
const { 
	checkUserProfileCompletion, 
	storeUserDetails, 
	isAdmin,
	setupMulter
} = require('./routesfunctions');
const { setupImageRoutes } = require('./imageRoutes');
const { setupLectureRoutes } = require('./lectureRoutes');
const { isUserAdminBySub, isUserEducatorBySub } = require('./utils/auth');
const {
	createBlankEncounter,
	updateEncounterField,
	duplicateEncounter,
	createEncounterChoice,
	updateEncounterChoice,
	deleteEncounterChoice,
	setReceivingEncounter,
	getUnlinkedEncounters,
	getRootEncounters,
	deleteRootEncounter // NEW
} = require('./encounterOperations');
const { currentQuiz } = require('./globals');
const { 
	validateRequiredFields, 
	isValidFieldName, 
	handleErrorResponse,
	sanitizeValue 
} = require('./utils');
const { setupUserRoutes } = require('./userRoutes');
const { setupMessageRoutes } = require('./messageRoutes');
const { setupJournalRoutes } = require('./journalRoutes');
const setupArticleRoutes = require('./src/articles/article.routes');
const {
	createLectureLink,
	createLectureFile,
	getLecturesForUser,
	getAllLectures,
	updateLecture,
	createBlankLecture,
	releaseLectureToAllStudents,
	getAccessibleLecturesForUser,
	submitLectureForApproval,
	approveLecture,
	denyLecture
} = require('./lectureOperations');
const { getOrCreateDirectConversation, addMessage, getConversationParticipants, sendSystemDirectMessage } = require('./messageOperations');
const { setupSelfTestRoutes } = require('./selfTestRoutes');

// other includes
const express = require('express');
const path = require('path');
const cors = require('cors');
const { auth, requiresAuth } = require('express-openid-connect'); // for auth0
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const { db, dbPromise } = require('./db');
const crypto = require('crypto');
const util = require('util');
// The main codebase now prefers the promise pool – expose a helper alias for
// concise awaitable calls that preserves the existing `dbQuery(...)` usage.
const dbQuery = dbPromise.query.bind(dbPromise);



const config = { //auth0 config
	authRequired: false,
	auth0Logout: true,
	secret: 'w5fSUgs8Pg%c$MVGpab5*Q44nN#3YXfvnPo%!byF8^uBhaBxBZ&SbAE7D%Q^Z96#U3b8ns',
	baseURL: 'https://www.viralvalor.com',
	clientID: '6MakL0x2tNBn7RzjETREKxyQu4aj4408',
	issuerBaseURL: 'https://dev-sygugfcjg34k0wee.us.auth0.com'
};

// Image Uploads



const setupRoutes = (app) => {
	console.log('>>> setupRoutes function entered.'); // Log entry
	// app.set('view engine', 'ejs'); // Deprecated – EJS pages have been removed
	// app.set('views', path.join(__dirname, 'public')); // Deprecated – React SPA is now sole front-end
	app.use(bodyParser.urlencoded({ extended: true })); // parse application/x-www-form-urlencoded


	app.use(bodyParser.json()); // parse application/json
	app.use(cors({ // Allow/disallow remote connections server -> server
		origin: '*'
	}));
	app.use('/images', express.static(path.join(__dirname, 'public/images'))); // allow image downloads from here

	// Register image upload endpoints (moved to dedicated module)
	setupImageRoutes(app);

	// INSERT: serve lecture uploaded files
	app.use('/lectures/uploads', express.static(path.join(__dirname, 'public/lectures/uploads')));
	app.use(auth(config)); // auth router attaches /login, /logout, and /callback routes to the baseURL

    // Setup user management routes
    setupUserRoutes(app);
    setupMessageRoutes(app);
    setupJournalRoutes(app);
    setupArticleRoutes(app);
    // NEW: Modular lecture endpoints
    setupLectureRoutes(app);
    // Admin self-test endpoint
    setupSelfTestRoutes(app);

	app.use((req, res, next) => { // Logging middleware to show all requests
		const date = new Date();
		date.setHours(date.getHours() - 5); // Subtract 5 hours
		const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
		const userAgent = req.get('User-Agent');
		const clientIp = req.ip || req.connection.remoteAddress;
	
		const knownUsers = [
			{ hash: '175fc9cff6', name: 'David' },
			{ hash: 'PLACEHOLDER', name: 'Caity' } // Replace 'PLACEHOLDER' with the actual hash later
		];
	
		// Create a hash from IP and User-Agent and truncate to 10 characters
		const hash = crypto.createHash('sha256').update(clientIp + userAgent).digest('hex').substring(0, 10);
	
		const userEntry = knownUsers.find(u => hash.startsWith(u.hash));
		const user = userEntry ? userEntry.name : `Unknown (${hash})`;
	
		console.log(`[${formattedDate}] User: ${user} - Received ${req.method} request for ${req.url}`);
		next();
	});
	
	
	
	
	// -------------------- Lecture Endpoints ----------------------
	// MIGRATED – as of 2025-05-18 these endpoints live in `lectureRoutes.js`.
	// All historical URLs remain unchanged because `setupLectureRoutes(app)` is
	// invoked near the top of this file. The legacy handlers have been removed
	// to reduce duplication and complexity.
	// -------------------- End Lecture Endpoints ----------------------

	// -------------------- Encounter & Storyline Endpoints (REMOVED) ----------------------
	// These endpoints were migrated to `src/routes/encounterRoutes.js` during
	// milestone M3 (2025-05-18). Legacy support for existing public URLs is
	// provided by the alias middleware in `server.js` → `app.use('/encounters', legacyEncounterRoutes)`.
	// The hundreds of lines of old inline handlers have been purged for clarity.
	// -------------------- End Encounter & Storyline Endpoints ----------------------

	// User Pages - Admin User
	app.get('/admin', requiresAuth(), (req, res) => {
		// Only allow admins to hit the dashboard at all
		if (!isAdmin(req.oidc.user)) {
			return res.status(403).send('Access denied');
		}

		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	// User Pages - Standard User
	app.post('/submit-profile', requiresAuth(), (req, res) => {
		const userDetails = req.oidc.user;
		const displayName = req.body.displayName; // assuming input field name is 'displayName'
		storeUserDetails({
			sid: userDetails.sid,
			nickname: userDetails.nickname,
			name: userDetails.name,
			picture_url: null, // Ignore Auth0-provided avatar
			updated_at: userDetails.updated_at,
			email: userDetails.email,
			email_verified: userDetails.email_verified,
			auth0_sub: userDetails.sub,
			display_name: displayName
		}).then(() => {
			res.status(200).json({ message: 'Profile stored' });
		}).catch(error => {
			console.error('Error storing user details:', error);
			res.status(500).send('Internal Server Error');
		});
	});
	app.get('/profile', requiresAuth(), (req, res) => {
		res.send(JSON.stringify(req.oidc.user));
	});
	// Legacy support: /complete-profile now redirects to the in-app profile tab
	app.get('/complete-profile', (req, res) => {
		res.redirect('/?tab=profile');
	});

	// Inline handlers removed – domain now served by `src/routes/characterRoutes.js`

	// Backdrop endpoints migrated to `src/routes/backdropRoutes.js` – duplicates removed.

	// Redirect legacy HTML endpoints to SPA
	const legacyHtmlRoutes = ['/encounter', '/encounter2', '/hollingshead'];
	legacyHtmlRoutes.forEach(route => {
		app.get(route, (req, res) => res.redirect('/'));
	});

	// Root route now serves the React SPA
	app.get('/', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			return res.sendFile(path.join(__dirname, 'client/build/index.html'));
		}
		// In development assume CRA dev server is running on localhost:3000
		res.redirect('http://localhost:3000' + req.originalUrl);
	});

	// Chat – handled inside SPA; keep auth check to prevent exposing data
	app.get('/chat', requiresAuth(), (req, res) => {
		// If user profile incomplete, still send them to SPA profile tab
		checkUserProfileCompletion(req.oidc.user.sub).then(isComplete => {
			const dest = isComplete ? '/?tab=chat' : '/?tab=profile';
			res.redirect(dest);
		});
	});

	// Add these routes before the app.get('*') catchall route

	app.get('/multiplayer', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	app.get('/educator-panel', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	app.get('/encounter-display', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	app.get('/presentation-display', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			// Consistent with /multiplayer, /educator-panel, etc.
			// Assumes that for development, these routes serve public/index.html
			// If they should redirect to CRA dev server, adjust accordingly.
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	// Routes for the new encounter display with gameId
	app.get('/encounters2/:id', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	// New route for games with UUID
	app.get('/game/:gameId/encounter/:id', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	// New route for educator panel with gameId
	app.get('/game/:gameId/educator-panel', (req, res) => {
		if (process.env.NODE_ENV === 'production') {
			res.sendFile(path.join(__dirname, 'client/build/index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'public/index.html'));
		}
	});

	// ------------------- Student Question Practice --------------------
	// (Removed – now served by src/routes/questionRoutes.js)

	// Helper to check encounter ownership (creator)
	async function isEncounterOwner(encounterId, userSub) {
		if (!userSub) return false;
		try {
			const rows = await dbQuery('SELECT _REC_Creation_User FROM Encounters WHERE ID = ? LIMIT 1', [encounterId]);
			return rows.length > 0 && rows[0]._REC_Creation_User === userSub;
		} catch (err) {
			console.error('isEncounterOwner DB error', err);
			return false;
		}
	}

	// Helper to check ownership of an encounter via a route ID
	async function isRouteOwner(routeId, userSub) {
		if (!userSub) return false;
		try {
			const rows = await dbQuery(`SELECT e._REC_Creation_User
										 FROM EncounterRoutes r
										 JOIN Encounters e ON e.ID = r.RelID_Encounter_Calling
										 WHERE r.ID = ? LIMIT 1`, [routeId]);
			return rows.length > 0 && rows[0]._REC_Creation_User === userSub;
		} catch (err) {
			console.error('isRouteOwner DB error', err);
			return false;
		}
	}

	// Helper `isQuestionOwner` removed – logic hosted in modular router now.

	// -------------------- Tag Endpoints ----------------------
	// Tag endpoints migrated to `src/routes/tagRoutes.js` – duplicates removed.

	// Functions have been moved to routesfunctions.js

	app.get('/my-released-lectures', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
		try {
			const rows = await getAccessibleLecturesForUser(requestSub);
			res.json(rows);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching accessible lectures');
		}
	});

	// Educator submits lecture for approval
	app.post('/submit-lecture-for-approval', async (req, res) => {
		const { lectureId } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		try {
			await submitLectureForApproval(lectureId, requestSub);
			res.json({ message: 'Lecture submitted for approval' });
		} catch (err) {
			handleErrorResponse(err, res, 'Error submitting lecture');
		}
	});

	// Admin approves a pending lecture
	app.post('/approve-lecture', async (req, res) => {
		const { lectureId } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can approve lectures' });

		try {
			await approveLecture(lectureId, requestSub);

			// Notify lecture creator of approval via system direct message
			try {
				const rows = await dbQuery('SELECT createdBy, title FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
				if (rows && rows.length) {
					const { createdBy, title } = rows[0];
					if (createdBy) {
						const body = `Your lecture \"${title}\" has been approved by an administrator.`;

						const io = req.app.get('io');
						await sendSystemDirectMessage(createdBy, body, io);
					}
				}
			} catch (notifyErr) {
				console.error('Failed to send approval notification:', notifyErr);
			}

			res.json({ message: 'Lecture approved' });
		} catch (err) {
			// Provide the specific error message to the client (e.g., missing tags)
			const msg = err?.message || 'Error approving lecture';
			return res.status(400).json({ error: msg });
		}
	});

	// Admin denies a pending lecture (sends back to draft and notifies creator)
	app.post('/deny-lecture', async (req, res) => {
		const { lectureId } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can deny lectures' });

		try {
			const { createdBy, title } = await denyLecture(lectureId, requestSub);

			// Construct and send chat notification to creator (even if same user rejected)
			if (createdBy) {
				try {
					// Build an absolute URL to the lecture edit page
					const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
					const editLink = `${baseUrl}/?tab=lecture-edit&lecture=${lectureId}`;
					const body = `Your lecture \"${title}\" was denied by an administrator and has been moved back to draft. You can edit it <a href=\"${editLink}\">here</a>.`;

					// Use the new helper to send the system message
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

	// ---------------- System Messaging -------------------

	// Endpoint to send a direct system message to a user (temporary: open to all authenticated users)
	app.post('/send-system-message', async (req, res) => {
		const { toUserSub, body } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!toUserSub || !body) {
			return res.status(400).json({ error: 'toUserSub and body are required' });
		}
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		// NOTE: previously restricted to admins; now open to any authenticated user for testing.
		try {
			const io = req.app.get('io');
			const result = await sendSystemDirectMessage(toUserSub, body, io);
			res.json({ success: true, ...result });
		} catch (err) {
			handleErrorResponse(err, res, 'Error sending system message');
		}
	});

	// Student Instruction endpoints migrated to `src/routes/instructionRoutes.js` – duplicates removed.

}; // end setupRoutes

module.exports = { setupRoutes };  // Export the setup function

