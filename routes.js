// my includes
const { 
	checkUserProfileCompletion, 
	storeUserDetails, 
	isAdmin,
	GetEncounterData,
	GetBadgeData,
	GetAllBadgesData,
	GetCharacterData,
	GetAllCharacterData,
	GetBackdropData,
	GetAllBackdropData,
	GetInstructionData,
	GetAllInstructionData,
	setupMulter
} = require('./routesfunctions');
const {
	EncounterUploadHandler,
	BadgeUploadHandler,
	CharacterUploadHandler,
	BackdropUploadHandler,
	ProfileUploadHandler,
	InstructionUploadHandler
} = require('./imageHandlers');
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
const { updateBadgeField } = require('./badgeOperations');
const { updateCharacterField } = require('./characterOperations');
const { updateBackdropField } = require('./backdropOperations');
const { updateInstructionField } = require('./studentInstructionOperations');
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
const setupArticleRoutes = require('./articleRoutes');
const {
	createBlankQuestion,
	updateQuestionField,
	deleteQuestion,
	createQuestionOption,
	updateQuestionOption,
	deleteQuestionOption,
	setCorrectOption,
	getQuestionsByUser,
	getQuestionWithOptions,
	getAllQuestions,
	getQuestionsByLecture,
	getQuestionsByTag
} = require('./questionOperations');
const { createLectureLink, createLectureFile, getLecturesForUser, getAllLectures, updateLecture, createBlankLecture, releaseLectureToAllStudents, getAccessibleLecturesForUser, submitLectureForApproval, approveLecture, denyLecture } = require('./lectureOperations');
const { getOrCreateDirectConversation, addMessage, getConversationParticipants, sendSystemDirectMessage } = require('./messageOperations');

// other includes
const express = require('express');
const path = require('path');
const cors = require('cors');
const { auth, requiresAuth } = require('express-openid-connect'); // for auth0
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const { db } = require('./db');
const crypto = require('crypto');
const util = require('util');
const dbQuery = util.promisify(db.query).bind(db);



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
	app.set('view engine', 'ejs');
	app.set('views', path.join(__dirname, 'public'));
	app.use(bodyParser.urlencoded({ extended: true })); // parse application/x-www-form-urlencoded


	app.use(bodyParser.json()); // parse application/json
	app.use(cors({ // Allow/disallow remote connections server -> server
		origin: '*'
	}));
	app.use('/images', express.static(path.join(__dirname, 'public/images'))); // allow image downloads from here

	app.use(express.static('public')); // Sets the working directory or something or another
	// INSERT: serve lecture uploaded files
	app.use('/lectures/uploads', express.static(path.join(__dirname, 'public/lectures/uploads')));
	app.use(auth(config)); // auth router attaches /login, /logout, and /callback routes to the baseURL

    // Setup user management routes
    setupUserRoutes(app);
    setupMessageRoutes(app);
    setupJournalRoutes(app);
    setupArticleRoutes(app);

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
	
	
	
	// Image Upload Paths - handlers imported from imageHandlers.js
	app.post('/images/uploads/backdrops/', setupMulter('public/images/uploads/backdrops/').single('image'), BackdropUploadHandler);
	app.post('/images/uploads/characters/', setupMulter('public/images/uploads/characters/').single('image'), CharacterUploadHandler);
	app.post('/images/uploads/badges/', setupMulter('public/images/uploads/badges/').single('image'), BadgeUploadHandler);
	// Student Instruction images
	app.post('/images/uploads/instructions/', setupMulter('public/images/uploads/instructions/').single('image'), InstructionUploadHandler);
	// Profile pictures
	app.post('/images/uploads/profiles/', setupMulter('public/images/uploads/profiles/').single('image'), ProfileUploadHandler);

	// Lecture file uploads (PowerPoint)
	const lectureUpload = setupMulter('public/lectures/uploads').single('file');

	// -------------------- Lecture Endpoints ----------------------

	// Get list of lectures created by current user (educator/admin)
	app.get('/my-lectures', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		// Only educators or admins can access their lecture list
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isEducatorFlag = await isUserEducatorBySub(requestSub);
		if (!isAdminFlag && !isEducatorFlag) {
			return res.status(403).json({ error: 'Only educators or administrators can access lectures' });
		}

		try {
			const rows = isAdminFlag ? await getAllLectures() : await getLecturesForUser(requestSub);
			res.json(rows);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching lectures');
		}
	});

	// Create a lecture that is just a link
	app.post('/create-lecture-link', async (req, res) => {
		const { title, url, description = '' } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		// Validate required fields
		if (!title || !url) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: ['title', 'url'] });
		}
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		// Authorization
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isEducatorFlag = await isUserEducatorBySub(requestSub);
		if (!isAdminFlag && !isEducatorFlag) {
			return res.status(403).json({ error: 'Only educators or administrators can create lectures' });
		}

		createLectureLink(title, url, requestSub, description)
			.then(lectureId => res.status(200).json({ lectureId }))
			.catch(err => handleErrorResponse(err, res, 'Error creating lecture link'));
	});

	// Create a blank lecture and return its ID so that questions can be added immediately
	app.post('/create-blank-lecture', async (req, res) => {
		const { userSub, title = 'Untitled Lecture', description = '' } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		// Validate required fields
		if (!userSub) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: ['userSub'] });
		}
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		// Authorization: Can only create for self unless admin
		if (userSub !== requestSub) {
			const isAdminFlag = await isUserAdminBySub(requestSub);
			if (!isAdminFlag) {
				return res.status(403).json({ error: 'You can only create lectures for yourself' });
			}
		}

		// Must be educator or admin
		const isAdminFlag2 = await isUserAdminBySub(requestSub);
		const isEducatorFlag2 = await isUserEducatorBySub(requestSub);
		if (!isAdminFlag2 && !isEducatorFlag2) {
			return res.status(403).json({ error: 'Only educators or administrators can create lectures' });
		}

		// Create blank lecture
		createBlankLecture(userSub, title, description)
			.then(lectureId => res.status(200).json({ lectureId }))
			.catch(err => handleErrorResponse(err, res, 'Error creating lecture'));
	});

	// Upload a new lecture via file (retains original behaviour for creating lecture and file in one step)
	app.post('/upload-lecture-file', lectureUpload, async (req, res) => {
		const { title, description = '' } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!title) {
			return res.status(400).json({ error: 'Missing required field', missingFields: ['title'] });
		}
		if (!req.file) {
			return res.status(400).json({ error: 'No file uploaded' });
		}
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		// Authorization
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isEducatorFlag = await isUserEducatorBySub(requestSub);
		if (!isAdminFlag && !isEducatorFlag) {
			return res.status(403).json({ error: 'Only educators or administrators can upload lectures' });
		}

		const { filename, originalname } = req.file;

		createLectureFile(title, filename, originalname, requestSub, description)
			.then(lectureId => res.status(200).json({ lectureId }))
			.catch(err => handleErrorResponse(err, res, 'Error uploading lecture file'));
	});

	// Attach/replace a PowerPoint file for an existing lecture
	app.post('/upload-lecture-file-existing', lectureUpload, async (req, res) => {
		const { id } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!id) {
			return res.status(400).json({ error: 'Missing lecture id' });
		}
		if (!req.file) {
			return res.status(400).json({ error: 'No file uploaded' });
		}
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		try {
			// Check ownership or admin
			const rows = await dbQuery('SELECT createdBy FROM lectures WHERE id = ? LIMIT 1', [id]);
			if (!rows || rows.length === 0) {
				return res.status(404).json({ error: 'Lecture not found' });
			}
			const isOwner = rows[0].createdBy === requestSub;
			const isAdminFlag = await isUserAdminBySub(requestSub);
			if (!isOwner && !isAdminFlag) {
				return res.status(403).json({ error: 'You do not have permission to edit this lecture' });
			}

			const { filename, originalname } = req.file;
			await dbQuery('UPDATE lectures SET fileNameServer = ?, originalName = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [filename, originalname, id]);

			return res.status(200).json({ message: 'File uploaded' });
		} catch (err) {
			handleErrorResponse(err, res, 'Error uploading lecture file');
		}
	});

	// Download a lecture PowerPoint with a friendly filename
	app.get('/download-lecture-file/:id', async (req, res) => {
		const lectureId = req.params.id;
		try {
			const rows = await dbQuery('SELECT title, fileNameServer, originalName FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
			if (!rows || rows.length === 0) {
				return res.status(404).send('Lecture not found');
			}

			const { title, fileNameServer, originalName } = rows[0];
			if (!fileNameServer) {
				return res.status(400).send('Lecture does not have an uploaded file');
			}

			const filePath = path.join(__dirname, 'public/lectures/uploads', fileNameServer);
			if (!fs.existsSync(filePath)) {
				return res.status(404).send('File not found');
			}

			// Determine extension (prefer originalName)
			const ext = path.extname(originalName || '') || path.extname(fileNameServer) || '.pptx';

			// Sanitize the title to create a safe filename
			let safeTitle = (title || 'lecture').toString().replace(/[^a-z0-9\-_]/gi, '_');
			if (!safeTitle) safeTitle = 'lecture';

			const downloadName = `${safeTitle}${ext}`;
			return res.download(filePath, downloadName);
		} catch (err) {
			handleErrorResponse(err, res, 'Error downloading lecture file');
		}
	});

	// Delete uploaded file for an existing lecture
	app.post('/delete-lecture-file', async (req, res) => {
		const { id } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!id) return res.status(400).json({ error: 'Missing lecture id' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		try {
			const rows = await dbQuery('SELECT createdBy, fileNameServer FROM lectures WHERE id = ? LIMIT 1', [id]);
			if (!rows || rows.length === 0) return res.status(404).json({ error: 'Lecture not found' });

			const { createdBy, fileNameServer } = rows[0];
			if (!fileNameServer) return res.status(400).json({ error: 'No file to delete' });

			const isOwner = createdBy === requestSub;
			const isAdminFlag = await isUserAdminBySub(requestSub);
			if (!isOwner && !isAdminFlag) return res.status(403).json({ error: 'Forbidden' });

			// Delete file from FS (best-effort)
			try {
				const p = path.join(__dirname, 'public/lectures/uploads', fileNameServer);
				if (fs.existsSync(p)) fs.unlinkSync(p);
			} catch (err) {
				console.warn('Failed to delete ppt file from disk', err);
			}

			await dbQuery('UPDATE lectures SET fileNameServer = NULL, originalName = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [id]);
			return res.status(200).json({ message: 'File deleted' });
		} catch (err) {
			handleErrorResponse(err, res, 'Error deleting lecture file');
		}
	});

	// Delete an entire lecture (owner or admin)
	app.post('/delete-lecture', async (req, res) => {
		const { id } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!id) return res.status(400).json({ error: 'Missing lecture id' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		try {
			// Fetch lecture details
			const rows = await dbQuery('SELECT createdBy, fileNameServer FROM lectures WHERE id = ? LIMIT 1', [id]);
			if (!rows || rows.length === 0) return res.status(404).json({ error: 'Lecture not found' });

			const { createdBy, fileNameServer } = rows[0];
			const isOwner = createdBy === requestSub;
			const isAdminFlag = await isUserAdminBySub(requestSub);
			if (!isOwner && !isAdminFlag) {
				return res.status(403).json({ error: 'You do not have permission to delete this lecture' });
			}

			// Delete any lecture_access entries first
			await dbQuery('DELETE FROM lecture_access WHERE lectureId = ?', [id]);

			// ----------------------------------------------
			// Cascade-delete associated questions and data
			// ----------------------------------------------
			// 1. Fetch question IDs linked to this lecture
			const qRows = await dbQuery('SELECT id FROM questions WHERE lectureId = ?', [id]);
			if (qRows && qRows.length) {
				const questionIds = qRows.map(r => r.id);
				const placeholders = questionIds.map(() => '?').join(',');

				// 2. Delete attempts referencing these questions
				await dbQuery(`DELETE FROM question_attempts WHERE questionId IN (${placeholders})`, questionIds);

				// 3. Delete tag mappings for these questions
				await dbQuery(`DELETE FROM question_tags WHERE questionId IN (${placeholders})`, questionIds);

				// 4. Delete the questions themselves
				await dbQuery(`DELETE FROM questions WHERE id IN (${placeholders})`, questionIds);
			}

			// Finally, delete lecture row itself
			await dbQuery('DELETE FROM lectures WHERE id = ?', [id]);

			// Remove file from disk if exists
			if (fileNameServer) {
				const filePath = path.join(__dirname, 'public/lectures/uploads', fileNameServer);
				if (fs.existsSync(filePath)) {
					try { fs.unlinkSync(filePath); } catch (_) {}
				}
			}

			res.json({ message: 'Lecture deleted' });
		} catch (err) {
			handleErrorResponse(err, res, 'Error deleting lecture');
		}
	});

	// -------------------- End Lecture Endpoints ----------------------

	// Story Line
	app.post('/create-blank-encounter', (req, res) => {
		const { userSub } = req.body;
		
		console.log(`[/create-blank-encounter] Request received with userSub: ${userSub?.substring(0, 8) || 'MISSING'}...`);
		
		// Get auth user from either session or header
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		console.log(`[/create-blank-encounter] Authentication info: session=${!!req.oidc?.user} header=${!!req.headers['x-user-sub']}`);
		console.log(`[/create-blank-encounter] Determined requestSub: ${requestSub} (from ${req.oidc?.user?.sub ? 'session' : 'header'})`);
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['userSub']);
		if (!validation.isValid) {
			console.log(`[/create-blank-encounter] Missing required fields: ${validation.missingFields.join(', ')}`);
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}

		// Ensure the user is creating an encounter for themselves (or is admin)
		if (!requestSub) {
			console.log(`[/create-blank-encounter] Authentication failed - no requestSub from session or header`);
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}

		console.log(`[/create-blank-encounter] RequestSub from session/header: ${requestSub?.substring(0, 8)}...`);
		console.log(`[/create-blank-encounter] UserSub from request body: ${userSub?.substring(0, 8)}...`);
		console.log(`[/create-blank-encounter] SubCheck: ${userSub === requestSub ? 'MATCH' : 'MISMATCH'}`);

		if (userSub !== requestSub) {
			return isUserAdminBySub(requestSub).then(isAdminFlag => {
				console.log(`[/create-blank-encounter] Admin check result: ${isAdminFlag ? 'IS ADMIN' : 'NOT ADMIN'}`);
				if (!isAdminFlag) {
					console.log(`[/create-blank-encounter] Permission denied - not admin and subs don't match`);
					return res.status(403).json({ error: 'You can only create encounters for yourself' });
				}
				// admin can override, proceed
				console.log(`[/create-blank-encounter] Admin override - proceeding with creation for another user`);
				return createBlankEncounter(userSub)
					.then(encounterId => {
						console.log(`[/create-blank-encounter] Successfully created encounter ${encounterId} for user ${userSub?.substring(0, 8)}...`);
						res.status(200).json({ encounterId });
					})
					.catch(error => {
						console.error(`[/create-blank-encounter] Database error:`, error);
						handleErrorResponse(error, res, 'Error creating blank encounter.');
					});
			});
		}
		
		console.log(`[/create-blank-encounter] Authorization passed - creating encounter for self`);
		createBlankEncounter(userSub)
			.then(encounterId => {
				console.log(`[/create-blank-encounter] Successfully created encounter ${encounterId} for user ${userSub?.substring(0, 8)}...`);
				res.status(200).json({ encounterId });
			})
			.catch(error => {
				console.error(`[/create-blank-encounter] Database error:`, error);
				handleErrorResponse(error, res, 'Error creating blank encounter.');
		});
	});

	app.post('/update-encounter-field', async (req, res) => {
		const { id, field, value } = req.body;
		
		// Get auth user from either session or header
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Ensure the user is authenticated
		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}
		
		// Authorization: only encounter owner or admin can modify
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isEncounterOwner(id, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to edit this scenario' });
		}
		
		// Validate field name to prevent SQL injection
		if (!isValidFieldName(field)) {
			return res.status(400).json({ error: 'Invalid field name' });
		}
		
		// Sanitize value before using it in the database
		const sanitizedValue = sanitizeValue(value);
		
		updateEncounterField(id, field, sanitizedValue)
			.then(() => {
			res.status(200).json({ message: 'Field updated successfully' });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error updating encounter field.');
		});
	});

	app.post('/duplicateEncounter', async (req, res) => {
		const { encounterId, userSub } = req.body;
		
		// Get auth user from either session or header
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['encounterId', 'userSub']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Ensure the user is authenticated
		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}
		
		// Permission: requestSub must match userSub or admin
		const isAdminFlag = await isUserAdminBySub(requestSub);
		if (userSub !== requestSub && !isAdminFlag) {
			return res.status(403).json({ error: 'You do not have permission to duplicate encounters for another user' });
		}
		
		duplicateEncounter(encounterId, userSub)
			.then(newEncounterId => {
				res.json({ newEncounterId });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error duplicating record');
		});
	});

	app.get('/GetEncounterData/:id', async (req, res) => {
		const encounterId = req.params.id;
		const requestedScope = req.query.scope; // Check for scope
		
		// Validate that ID is a number
		if (isNaN(encounterId) || parseInt(encounterId) <= 0) {
			return res.status(400).json({ error: 'Invalid encounter ID' });
		}

		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		console.log(`[/GetEncounterData/:id] Determined requestSub: ${requestSub} (from ${req.oidc?.user?.sub ? 'session' : 'header'}) for ID: ${encounterId}`);

		// Authentication is still required, even for public scope, to prevent anonymous access
		if (!requestSub) {
			console.log(`[/GetEncounterData/:id] Authentication failed - no requestSub.`);
			return res.status(401).json({ error: 'User sub not provided' });
		}

		// Authorization check
		const isAdminFlag = await isUserAdminBySub(requestSub);
		let isOwnerFlag = false;
		let accessGranted = false;
		
		if (isAdminFlag) {
		    console.log(`[/GetEncounterData/:id] Access granted: User is Admin.`);
		    accessGranted = true;
		} else if (requestedScope === 'public') {
		    console.log(`[/GetEncounterData/:id] Access granted: Requested scope is public.`);
		    // Allow read access for any authenticated user if scope is public
		    accessGranted = true;
		} else {
		    // If not admin and not public scope, check ownership
		    isOwnerFlag = await isEncounterOwner(encounterId, requestSub);
		    if (isOwnerFlag) {
		        console.log(`[/GetEncounterData/:id] Access granted: User is Owner.`);
		        accessGranted = true;
		    } else {
		        console.log(`[/GetEncounterData/:id] Access denied: Not Admin, Not Owner, Scope not public.`);
		    }
		}

		if (!accessGranted) {
			return res.status(403).json({ error: 'You do not have permission to view this scenario' });
		}

		// Proceed to fetch data if access is granted
		GetEncounterData(parseInt(encounterId))
			.then(data => {
				// Add extra check: if encounter is null/not found after GetEncounterData
				if (!data || !data.Encounter) {
				    console.error(`[/GetEncounterData/:id] Encounter ${encounterId} not found by GetEncounterData function.`);
				    return res.status(404).json({ error: 'Encounter not found' });
				}
				res.json(data);
			})
			.catch(err => {
			    // Log the specific error from GetEncounterData if it occurs
			    console.error(`[/GetEncounterData/:id] Error in GetEncounterData function for ID ${encounterId}:`, err);
				handleErrorResponse(err, res, 'Server error retrieving encounter data.');
		});
	});

	// Routes
	app.post('/create-encounter-choice', async (req, res) => {
		const { EncounterID, UserSub } = req.body;
		
		// Get auth user from either session or header
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['EncounterID', 'UserSub']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Ensure the user is authenticated
		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}

		// Authorization: only encounter owner or admin can modify
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isEncounterOwner(EncounterID, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to create encounter choice' });
		}

		createEncounterChoice(EncounterID, UserSub)
			.then(choiceId => {
				res.status(200).json({ ID: choiceId });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error creating encounter choice.');
			});
	});

	app.post('/update-encounter-choice', async (req, res) => {
		const { ID, Title } = req.body;
		
		// Get auth user from either session or header
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['ID', 'Title']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Ensure the user is authenticated
		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}
		
		// Authorization
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isRouteOwner(ID, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to edit this choice' });
		}
		// Sanitize title
		const sanitizedTitle = sanitizeValue(Title);

		updateEncounterChoice(ID, sanitizedTitle)
			.then(() => {
				res.status(200).json({ message: 'Choice updated successfully' });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error updating encounter choice.');
			});
	});

	app.post('/delete-encounter-choice', async (req, res) => {
		const { ID } = req.body;
		
		// Get auth user from either session or header
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['ID']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Ensure the user is authenticated
		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}

		// Authorization
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isRouteOwner(ID, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to delete this choice' });
		}

		deleteEncounterChoice(ID)
			.then(() => {
				res.status(200).json({ message: 'Choice deleted successfully' });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error deleting encounter choice.');
			});
	});

	app.post('/set-receiving-encounter', async (req, res) => {
		const { RouteID, selectedEncounterID } = req.body;
		
		// Get auth user from either session or header
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		
		// Validate required RouteID (selectedEncounterID can be null to support unlinking)
		const validation = validateRequiredFields(req.body, ['RouteID']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Ensure the user is authenticated
		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}

		// Authorization
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isRouteOwner(RouteID, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to link encounters for this choice' });
		}
		
		setReceivingEncounter(RouteID, selectedEncounterID)
			.then(() => {
				res.status(200).json({ message: 'Receiving encounter set successfully' });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error setting receiving encounter.');
			});
	});

	app.get('/unlinked-encounters', (req, res) => {
		getUnlinkedEncounters()
			.then(results => {
				res.status(200).json(results);
			})
			.catch(error => {
				console.error(error);
				res.status(500).send('Error fetching unlinked encounters.');
		});
	});

	console.log('>>> Defining /root-encounters route...'); // Log before definition
	app.get('/root-encounters', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		const requestedScope = req.query.scope; // Check for scope query parameter
		
		let sql = 'SELECT ID, Title FROM Encounters WHERE IsRootEncounter = 1';
		const params = [];
		let isAdminFlag = false;
		let applyOwnershipFilter = true; // Default to filtering

		// Check if admin
		if (requestSub) {
			isAdminFlag = await isUserAdminBySub(requestSub);
		}
		
		// Determine if ownership filter should be applied
		if (isAdminFlag || requestedScope === 'public') {
		    // Admins or requests explicitly asking for public scope get everything
		    applyOwnershipFilter = false;
		    console.log(`[/root-encounters] Skipping ownership filter (Admin: ${isAdminFlag}, Scope: ${requestedScope})`);
		} else if (!requestSub) {
		    // If not admin, not public scope, AND user is not identified (shouldn't happen if requiresAuth is used, but good failsafe)
		    // This case might need review depending on whether truly anonymous access is intended.
		    // For now, assume public means public, otherwise require auth & filter.
		    console.log('[/root-encounters] No user identified and not public scope. Returning empty.');
            return res.json([]); // Return empty if no user and not explicitly public
		}
		
		// Apply the filter if needed
		if (applyOwnershipFilter) {
		    console.log(`[/root-encounters] Applying ownership filter for user: ${requestSub ? requestSub.substring(0,8) : 'N/A'}...`);
			sql += ' AND _REC_Creation_User = ?';
			params.push(requestSub);
		}

		const finalSql = sql + ' ORDER BY Title';
		console.log(`[/root-encounters] Executing SQL: ${finalSql} with PARAMS:`, params);

		db.query(finalSql, params, (error, results) => {
			if (error) {
				console.error('Error fetching root encounters:', error);
				return res.status(500).send('Error fetching root encounters.');
			}
			console.log(`[/root-encounters] DB returned ${results?.length ?? 0} rows.`);
			res.status(200).json(results);
		});
	});

	// NEW: Delete an entire root scenario and its nested encounters/routes
	app.post('/delete-root-encounter', async (req, res) => {
		const { rootEncounterId } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		// Validate required fields
		if (!rootEncounterId) {
			return res.status(400).json({ error: 'Missing required field: rootEncounterId' });
		}
		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Authorization – must be owner or admin
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isEncounterOwner(rootEncounterId, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to delete this scenario' });
		}

		try {
			await deleteRootEncounter(rootEncounterId);
			res.status(200).json({ message: 'Scenario deleted successfully' });
		} catch (err) {
			handleErrorResponse(err, res, 'Error deleting scenario');
		}
	});

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

	// Badges
	app.post('/update-badge-field', (req, res) => {
		const { id, field, value } = req.body;
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Validate field name to prevent SQL injection
		if (!isValidFieldName(field)) {
			return res.status(400).json({ error: 'Invalid field name' });
		}
		
		// Sanitize value before using it in the database
		const sanitizedValue = sanitizeValue(value);

		updateBadgeField(id, field, sanitizedValue)
			.then(() => {
			res.status(200).json({ message: 'Field updated successfully' });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error updating badge field.');
		});
	});
	app.get('/GetBadgeData/:id', (req, res) => {
		const badgeId = req.params.id;
		
		// Validate that ID is a number
		if (isNaN(badgeId) || parseInt(badgeId) <= 0) {
			return res.status(400).json({ error: 'Invalid badge ID' });
		}

		GetBadgeData(parseInt(badgeId))
			.then(data => {
			res.json(data);
			})
			.catch(err => {
				handleErrorResponse(err, res, 'Server error');
		});
	});
	app.get('/GetAllBadgesData', (req, res) => {
		GetAllBadgesData()
			.then(data => {
			res.json(data);
			})
			.catch(err => {
				console.error(err);
				res.status(500).send('Server error');
		});
	});

	// Delete a badge
	app.post('/delete-badge', (req, res) => {
		const { ID } = req.body;
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['ID']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}

		// Delete badge using ID
		db.query('DELETE FROM Badges WHERE ID = ?', [ID], function(error, results) {
			if (error) {
				console.error('Error deleting badge:', error);
				return res.status(500).json({ error: 'Error deleting badge: ' + error.message });
			}
			
			res.status(200).json({ message: 'Badge deleted successfully' });
		});
	});

	// Character Models
	app.post('/update-character-field', (req, res) => {
		const { id, field, value } = req.body;
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Validate field name to prevent SQL injection
		if (!isValidFieldName(field)) {
			return res.status(400).json({ error: 'Invalid field name' });
		}
		
		// Sanitize value before using it in the database
		const sanitizedValue = sanitizeValue(value);

		updateCharacterField(id, field, sanitizedValue)
			.then(() => {
			res.status(200).json({ message: 'Field updated successfully' });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error updating character field.');
		});
	});

	// Delete a character
	app.post('/delete-character', (req, res) => {
		const { ID } = req.body;
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['ID']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}

		// Delete character using ID
		db.query('DELETE FROM CharacterModels WHERE ID = ?', [ID], function(error, results) {
			if (error) {
				console.error('Error deleting character:', error);
				return res.status(500).json({ error: 'Error deleting character: ' + error.message });
			}
			
			res.status(200).json({ message: 'Character deleted successfully' });
		});
	});

	app.get('/GetCharacterData/:id', (req, res) => {
		const characterId = req.params.id;
		
		// Validate that ID is a number
		if (isNaN(characterId) || parseInt(characterId) <= 0) {
			return res.status(400).json({ error: 'Invalid character ID' });
		}

		GetCharacterData(parseInt(characterId))
			.then(data => {
			res.json(data);
			})
			.catch(err => {
				handleErrorResponse(err, res, 'Server error');
		});
	});
	app.get('/GetAllCharacterData', (req, res) => {
		GetAllCharacterData()
			.then(data => {
			res.json(data);
			})
			.catch(err => {
				console.error(err);
				res.status(500).send('Server error');
		});
	});

	// Backdrops
	app.post('/update-backdrop-field', (req, res) => {
		const { id, field, value } = req.body;
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}
		
		// Validate field name to prevent SQL injection
		if (!isValidFieldName(field)) {
			return res.status(400).json({ error: 'Invalid field name' });
		}
		
		// Sanitize value before using it in the database
		const sanitizedValue = sanitizeValue(value);

		updateBackdropField(id, field, sanitizedValue)
			.then(() => {
			res.status(200).json({ message: 'Field updated successfully' });
			})
			.catch(error => {
				handleErrorResponse(error, res, 'Error updating backdrop field.');
		});
	});

	// Delete a backdrop
	app.post('/delete-backdrop', (req, res) => {
		const { ID } = req.body;
		
		// Validate required fields
		const validation = validateRequiredFields(req.body, ['ID']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}

		// Delete backdrop using ID
		db.query('DELETE FROM Backdrops WHERE ID = ?', [ID], function(error, results) {
			if (error) {
				console.error('Error deleting backdrop:', error);
				return res.status(500).json({ error: 'Error deleting backdrop: ' + error.message });
			}
			
			res.status(200).json({ message: 'Backdrop deleted successfully' });
		});
	});

	app.get('/GetBackdropData/:id', (req, res) => {
		const backdropId = req.params.id;
		
		// Validate that ID is a number
		if (isNaN(backdropId) || parseInt(backdropId) <= 0) {
			return res.status(400).json({ error: 'Invalid backdrop ID' });
		}

		GetBackdropData(parseInt(backdropId))
			.then(data => {
			res.json(data);
			})
			.catch(err => {
				handleErrorResponse(err, res, 'Server error');
		});
	});
	app.get('/GetAllBackdropData', (req, res) => {
		GetAllBackdropData()
			.then(data => {
			res.json(data);
			})
			.catch(err => {
				console.error(err);
				res.status(500).send('Server error');
		});
	});

	// Temporary -OR- Testing
	app.get('/encounter', async (req, res) => {
		res.sendFile(path.join(__dirname, 'index.html'));
	});
	app.get('/encounter2', async (req, res) => {
		res.sendFile(path.join(__dirname, 'multi.html'));
	});
	app.get('/hollingshead', (req, res) => {
        res.sendFile(path.join(__dirname, 'UTMC.html'));
    });

	// Landing Page as Root
	app.get('/', (req, res) => {
		res.sendFile(path.join(__dirname, 'LandingPage.html'));
	});

	// Chat
	app.get('/chat', requiresAuth(), (req, res) => {
		// Check if the user has already completed their profile
		const userDetails = req.oidc.user;
		checkUserProfileCompletion(userDetails.sub).then(isComplete => {
			if (!isComplete) {
				// Redirect to profile editor within SPA if the profile isn't complete
				res.redirect('/?tab=profile');
			} else {
				// Render the chat if the profile is complete
				res.render('chat', {
					userDetails: userDetails
				});
			}
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

	// ---- Question Bank Endpoints ----

	// Create blank question
	app.post('/create-blank-question', async (req, res) => {
		const { userSub, lectureId = null } = req.body;

		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		// Validate required fields
		const validation = validateRequiredFields(req.body, ['userSub']);
		if (!validation.isValid) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
		}

		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized - no user identification provided' });
		}

		// Only educators or admins can create
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isEducatorFlag = await isUserEducatorBySub(requestSub);
		if (!isAdminFlag && !isEducatorFlag) {
			return res.status(403).json({ error: 'Only educators or administrators can create questions' });
		}

		// Must be creating for self or admin creating for another
		if (userSub !== requestSub && !isAdminFlag) {
			return res.status(403).json({ error: 'You can only create questions for yourself' });
		}

		createBlankQuestion(userSub, lectureId)
			.then(questionId => res.status(200).json({ questionId }))
			.catch(err => handleErrorResponse(err, res, 'Error creating blank question.'));
	});

	// Update question field (e.g., QuestionText)
	app.post('/update-question-field', async (req, res) => {
		const { id, field, value } = req.body;

		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
		if (!validation.isValid) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
		}

		if (!requestSub) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		// Authorization
		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isQuestionOwner(id, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to edit this question' });
		}

		if (!isValidFieldName(field)) {
			return res.status(400).json({ error: 'Invalid field name' });
		}

		const sanitizedValue = sanitizeValue(value);

		updateQuestionField(id, field, sanitizedValue)
			.then(() => res.status(200).json({ message: 'Field updated successfully' }))
			.catch(err => handleErrorResponse(err, res, 'Error updating question field.'));
	});

	// Delete question
	app.post('/delete-question', async (req, res) => {
		const { id } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		const validation = validateRequiredFields(req.body, ['id']);
		if (!validation.isValid) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
		}

		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isQuestionOwner(id, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to delete this question' });
		}

		deleteQuestion(id)
			.then(() => res.status(200).json({ message: 'Question deleted successfully' }))
			.catch(err => handleErrorResponse(err, res, 'Error deleting question.'));
	});

	// Create question option (adds blank option)
	app.post('/create-question-option', async (req, res) => {
		const { questionId, userSub } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		const validation = validateRequiredFields(req.body, ['questionId', 'userSub']);
		if (!validation.isValid) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
		}

		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to add options' });
		}

		createQuestionOption(questionId, userSub)
			.then(optionId => res.status(200).json({ optionId }))
			.catch(err => handleErrorResponse(err, res, 'Error creating option.'));
	});

	// Update question option text
	app.post('/update-question-option', async (req, res) => {
		const { questionId, optionId, text, rationale } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		const validation = validateRequiredFields(req.body, ['questionId', 'optionId']);
		if (!validation.isValid) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
		}

		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to edit options' });
		}

		updateQuestionOption(optionId, text !== undefined ? sanitizeValue(text) : undefined, rationale !== undefined ? sanitizeValue(rationale) : undefined, questionId)
			.then(() => res.status(200).json({ message: 'Option updated successfully' }))
			.catch(err => handleErrorResponse(err, res, 'Error updating option.'));
	});

	// Delete option
	app.post('/delete-question-option', async (req, res) => {
		const { questionId, optionId } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		const validation = validateRequiredFields(req.body, ['questionId', 'optionId']);
		if (!validation.isValid) return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });

		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to delete options' });
		}

		deleteQuestionOption(optionId)
			.then(() => res.status(200).json({ message: 'Option deleted successfully' }))
			.catch(err => handleErrorResponse(err, res, 'Error deleting option.'));
	});

	// Set correct option
	app.post('/set-correct-option', async (req, res) => {
		const { questionId, optionId } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		const validation = validateRequiredFields(req.body, ['questionId', 'optionId']);
		if (!validation.isValid) return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });

		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to modify this question' });
		}

		setCorrectOption(questionId, optionId)
			.then(() => res.status(200).json({ message: 'Correct option set' }))
			.catch(err => handleErrorResponse(err, res, 'Error setting correct option.'));
	});

	// Get questions by user (if admin, return all)
	app.get('/my-questions', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);

		if (isAdminFlag) {
			// Admins see everything
			getAllQuestions()
				.then(rows => res.json(rows))
				.catch(err => handleErrorResponse(err, res, 'Error fetching questions.'));
		} else {
			getQuestionsByUser(requestSub)
				.then(rows => res.json(rows))
				.catch(err => handleErrorResponse(err, res, 'Error fetching questions.'));
		}
	});

	// Get full question with options
	app.get('/get-question/:id', async (req, res) => {
		const questionId = req.params.id;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		try {
			const question = await getQuestionWithOptions(questionId);
			const isAdminFlag = await isUserAdminBySub(requestSub);
			const isOwnerFlag = question._REC_Creation_User === requestSub;
			if (!isAdminFlag && !isOwnerFlag) {
				return res.status(403).json({ error: 'Forbidden' });
			}

			res.json(question);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching question.');
		}
	});

	// Helper: check question ownership
	async function isQuestionOwner(questionId, userSub) {
		if (!userSub) return false;
		try {
			const rows = await dbQuery('SELECT createdBy FROM questions WHERE id = ? LIMIT 1', [questionId]);
			return rows.length > 0 && rows[0].createdBy === userSub;
		} catch (err) {
			console.error('isQuestionOwner DB error', err);
			return false;
		}
	}

	// -------------------- Tag Endpoints ----------------------
	const { createTag, getAllTags, setQuestionTags } = require('./tagOperations');

	// Get all tags
	app.get('/tags', async (req, res) => {
		try {
			const rows = await getAllTags();
			res.json(rows);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching tags.');
		}
	});

	// Create a new tag (educator or admin only)
	app.post('/create-tag', async (req, res) => {
		const { name } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!name) return res.status(400).json({ error: 'Name is required' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isEducatorFlag = await isUserEducatorBySub(requestSub);
		if (!isAdminFlag && !isEducatorFlag) {
			return res.status(403).json({ error: 'Only educators or administrators can create tags' });
		}

		createTag(name, requestSub)
			.then(tagId => res.status(200).json({ tagId }))
			.catch(err => handleErrorResponse(err, res, 'Error creating tag.'));
	});

	// Set tags for a question (replace)
	app.post('/set-question-tags', async (req, res) => {
		const { questionId, tagIds } = req.body; // tagIds array
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		const validation = validateRequiredFields(req.body, ['questionId', 'tagIds']);
		if (!validation.isValid) {
			return res.status(400).json({ error: 'Missing required fields', missingFields: validation.missingFields });
		}

		if (!Array.isArray(tagIds)) {
			return res.status(400).json({ error: 'tagIds must be an array' });
		}

		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		const isOwnerFlag = await isQuestionOwner(questionId, requestSub);
		if (!isAdminFlag && !isOwnerFlag) {
			return res.status(403).json({ error: 'You do not have permission to edit tags for this question' });
		}

		setQuestionTags(questionId, tagIds)
			.then(() => res.status(200).json({ message: 'Tags updated' }))
			.catch(err => handleErrorResponse(err, res, 'Error setting tags.'));
	});

	// Admin tag filter across question bank
	app.get('/questions-by-tag/:tagId', async (req, res) => {
		const { tagId } = req.params;
		try {
			const rows = await getQuestionsByTag(tagId);
			res.json(rows);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching questions by tag');
		}
	});

	// ---- End Question Bank Endpoints ----

	// Helper to determine if a user is an educator (non-admin)
	async function isUserEducatorBySub(userSub) {
		if (!userSub) return false;
		try {
			const rows = await dbQuery('SELECT iseducator FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [userSub]);
			return rows.length > 0 && rows[0].iseducator === 1;
		} catch (err) {
			console.error('isUserEducatorBySub DB error', err);
			return false;
		}
	}

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

	// Helper to determine if a user (by Auth0 sub) has admin privileges
	async function isUserAdminBySub(userSub) {
		if (!userSub) return false;
		try {
			const rows = await dbQuery('SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [userSub]);
			return rows.length > 0 && rows[0].isadmin === 1;
		} catch (err) {
			console.error('isUserAdminBySub DB error', err);
			return false;
		}
	}

	// ------------------- Student Question Practice --------------------
	const { recordQuestionAttempt, getAttemptsForUser, getQuestionForStudent, getStudentAccessibleQuestions, getAttemptStatsForUser, getAttemptStatsForAllUsers, getAttemptStatsForAllQuestions, getAttemptStatsForAllTags, getAttemptStatsByTagForUser } = require('./questionOperations');

	// Fetch list of questions available to students (id + text).
	app.get('/student-questions', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
		try {
			const rows = await getStudentAccessibleQuestions(requestSub);
			res.json(rows);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching questions');
		}
	});

	// Fetch a single question for answering (no correct flags)
	app.get('/student-question/:id', async (req, res) => {
		const questionId = req.params.id;
		try {
			const question = await getQuestionForStudent(questionId);
			res.json(question);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching question');
		}
	});

	// Record a student attempt
	app.post('/record-question-attempt', async (req, res) => {
		const { questionId, selectedOptionId, timeTakenMs } = req.body;
		const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!userSub) return res.status(401).json({ error: 'Unauthorized' });
		if (!questionId || selectedOptionId === undefined || selectedOptionId === null) {
			return res.status(400).json({ error: 'Missing required fields' });
		}
		try {
			const result = await recordQuestionAttempt(questionId, userSub, selectedOptionId, timeTakenMs);
			res.status(200).json(result);
		} catch (err) {
			handleErrorResponse(err, res, 'Error recording attempt');
		}
	});

	// Get attempts for the current user (optionally filtered by questionId)
	app.get('/my-question-attempts', async (req, res) => {
		const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!userSub) return res.status(401).json({ error: 'Unauthorized' });
		const questionId = req.query.questionId || null;
		try {
			const attempts = await getAttemptsForUser(userSub, questionId);
			res.json(attempts);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching attempts');
		}
	});

	// Aggregate stats for current user
	app.get('/my-question-stats', async (req, res) => {
		const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

		const { startDate, endDate } = req.query;
		try {
			const stats = await getAttemptStatsForUser(userSub, startDate || null, endDate || null);
			res.json(stats);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching attempt stats');
		}
	});

	// Aggregate stats across all users (admin only)
	app.get('/admin/question-stats', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can access this endpoint' });

		const { startDate, endDate } = req.query;
		try {
			const stats = await getAttemptStatsForAllUsers(startDate || null, endDate || null);
			res.json(stats);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching all user attempt stats');
		}
	});

	// NEW: Aggregate stats across all questions (admin only)
	app.get('/admin/question-stats-by-question', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can access this endpoint' });

		const { startDate, endDate } = req.query;
		try {
			const stats = await getAttemptStatsForAllQuestions(startDate || null, endDate || null);
			res.json(stats);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching question attempt stats');
		}
	});

	// NEW: Aggregate stats across all tags (admin only)
	app.get('/admin/question-stats-by-tag', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can access this endpoint' });

		const { startDate, endDate, studentSub } = req.query;
		try {
			let stats;
			if (studentSub) {
				stats = await getAttemptStatsByTagForUser(studentSub, startDate || null, endDate || null);
			} else {
				stats = await getAttemptStatsForAllTags(startDate || null, endDate || null);
			}
			res.json(stats);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching tag attempt stats');
		}
	});

	// Fetch questions for a lecture (with optional tag filter)
	app.get('/lecture/:lectureId/questions', async (req, res) => {
		const { lectureId } = req.params;
		const tagId = req.query.tagId || null;
		try {
			const rows = await getQuestionsByLecture(lectureId, tagId);
			res.json(rows);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching questions for lecture');
		}
	});

	// Update lecture details (title, description, linkUrl) – owner or admin only
	app.post('/update-lecture', async (req, res) => {
		const { id, title, description = '', url } = req.body; // url optional corresponds to linkUrl
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!id) return res.status(400).json({ error: 'Missing lecture id' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		// Fetch lecture to verify ownership
		try {
			const rows = await dbQuery('SELECT createdBy FROM lectures WHERE id = ? LIMIT 1', [id]);
			if (!rows || rows.length === 0) {
				return res.status(404).json({ error: 'Lecture not found' });
			}

			const isOwner = rows[0].createdBy === requestSub;
			const isAdminFlag = await isUserAdminBySub(requestSub);

			if (!isOwner && !isAdminFlag) {
				return res.status(403).json({ error: 'You do not have permission to edit this lecture' });
			}

			const updateFields = {};
			if (title !== undefined) updateFields.title = title;
			if (description !== undefined) updateFields.description = description;
			if (url !== undefined) updateFields.linkUrl = url;

			await updateLecture(id, updateFields);
			res.status(200).json({ message: 'Lecture updated' });
		} catch (err) {
			handleErrorResponse(err, res, 'Error updating lecture');
		}
	});

	// Admin route to release a lecture to all students
	app.post('/release-lecture', async (req, res) => {
		const { lectureId } = req.body;
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];

		if (!lectureId) return res.status(400).json({ error: 'lectureId required' });
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

		const isAdminFlag = await isUserAdminBySub(requestSub);
		if (!isAdminFlag) return res.status(403).json({ error: 'Only admins can release lectures' });

		try {
			// Ensure approved
			const rows = await dbQuery('SELECT approvalStatus FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
			if (!rows || rows.length === 0) return res.status(404).json({ error: 'Lecture not found' });
			if (rows[0].approvalStatus !== 'APPROVED') {
				return res.status(400).json({ error: 'Lecture must be approved before release' });
			}

			const count = await releaseLectureToAllStudents(lectureId);

			// ---- Send system message to all students ----
			try {
				const lectRows = await dbQuery('SELECT title FROM lectures WHERE id = ? LIMIT 1', [lectureId]);
				const title = lectRows && lectRows.length ? lectRows[0].title : 'New lecture';

				const baseUrl = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get('host')}`;
				const lectureLink = `${baseUrl}/?tab=mylectures`;

				const body = `A new lecture assignment "${title}" has been added to your account. You can view it <a href=\"${lectureLink}\">here</a>.`;

				const students = await dbQuery('SELECT auth0_sub FROM UserAccounts WHERE (iseducator IS NULL OR iseducator = 0)');
				if (students && students.length) {
					const io = req.app.get('io');
					await Promise.all(students.map(u => sendSystemDirectMessage(u.auth0_sub, body, io).catch(() => {})));
				}
			} catch (notifyErr) {
				console.error('Failed to send lecture release notifications:', notifyErr);
			}

			res.json({ releasedCount: count });
		} catch (err) {
			handleErrorResponse(err, res, 'Error releasing lecture');
		}
	});

	// Quick helper route so frontend can know if current user is admin
	app.get('/am-admin', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
		const isAdminFlag = await isUserAdminBySub(requestSub);
		res.json({ isAdmin: isAdminFlag });
	});

	// ADDED: helper route to check educator flag so frontend can distinguish educator admins
	app.get('/am-educator', async (req, res) => {
		const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
		const isEducatorFlag = await isUserEducatorBySub(requestSub);
		res.json({ isEducator: isEducatorFlag });
	});

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

	// Aggregate tag stats for current user
	app.get('/my-question-stats-by-tag', async (req, res) => {
		const userSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
		if (!userSub) return res.status(401).json({ error: 'Unauthorized' });

		const { startDate, endDate } = req.query;
		try {
			const stats = await getAttemptStatsByTagForUser(userSub, startDate || null, endDate || null);
			res.json(stats);
		} catch (err) {
			handleErrorResponse(err, res, 'Error fetching tag attempt stats for user');
		}
	});

	// Instructions (Student Instructions)
	app.post('/update-instruction-field', (req, res) => {
		const { id, field, value } = req.body;

		const validation = validateRequiredFields(req.body, ['id', 'field', 'value']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}

		if (!isValidFieldName(field)) {
			return res.status(400).json({ error: 'Invalid field name' });
		}

		const sanitizedValue = sanitizeValue(value);

		updateInstructionField(id, field, sanitizedValue)
			.then(() => res.status(200).json({ message: 'Field updated successfully' }))
			.catch(error => handleErrorResponse(error, res, 'Error updating instruction field.'));
	});

	// Delete an instruction
	app.post('/delete-instruction', (req, res) => {
		const { ID } = req.body;
		const validation = validateRequiredFields(req.body, ['ID']);
		if (!validation.isValid) {
			return res.status(400).json({ 
				error: 'Missing required fields', 
				missingFields: validation.missingFields 
			});
		}

		db.query('DELETE FROM StudentInstructions WHERE ID = ?', [ID], function(error) {
			if (error) {
				console.error('Error deleting instruction:', error);
				return res.status(500).json({ error: 'Error deleting instruction: ' + error.message });
			}
			res.status(200).json({ message: 'Instruction deleted successfully' });
		});
	});

	app.get('/GetInstructionData/:id', (req, res) => {
		const instructionId = req.params.id;
		if (isNaN(instructionId) || parseInt(instructionId) <= 0) {
			return res.status(400).json({ error: 'Invalid instruction ID' });
		}

		GetInstructionData(parseInt(instructionId))
			.then(data => res.json(data))
			.catch(err => handleErrorResponse(err, res, 'Server error'));
	});

	app.get('/GetAllInstructionData', (req, res) => {
		GetAllInstructionData()
			.then(data => res.json(data))
			.catch(err => { console.error(err); res.status(500).send('Server error'); });
	});
};

module.exports = { setupRoutes };  // Export the setup function

