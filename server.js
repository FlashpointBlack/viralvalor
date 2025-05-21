// My includes
const { db, dbPromise } = require('./db');
const apiRoutes = require('./src/routes');
const userRoutesApi = require('./src/routes/userRoutesApi');
const messageRoutesApi = require('./src/routes/messageRoutesApi');
const { connectedUsers } = require('./globals');
var { quizResponses, currentQuiz } = require('./globals');
const { calculateQuizResults, formatResultsMessage } = require('./quizfunctions');
const {
  addMessage,
  addReaction,
  getConversationParticipants
} = require('./messageOperations');
// Other Includes
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const { auth } = require('express-openid-connect');

// ===== BEGIN ADDED LOGGING =====
app.use((req, res, next) => {
  console.log(`[SERVER INCOMING]: ${req.method} ${req.originalUrl}`);
  next();
});
// ===== END ADDED LOGGING =====

app.set('io', io);
const path = require('path');
const errorHandler = require('./utils/errorHandler');
const { isUserAdminBySub, isUserEducatorBySub } = require('./utils/auth');
// Legacy alias: expose encounter endpoints at root-level /encounters in addition to /api/encounters
// Legacy alias: expose question-bank endpoints at root-level (no /api prefix) in addition to /api/questions

// Pending quiz waiting to be sent
let pendingQuiz = null;

// Track last broadcasted student instruction (null when none active)
let currentInstruction = null;

// Global body parsing – required before mounting routers so req.body is populated
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== START REDIRECT SHIM MIDDLEWARE (M6) =====
const redirectShim = require('./src/middleware/redirectShim');
app.use(redirectShim);
// ===== END REDIRECT SHIM MIDDLEWARE (M6) =====

console.log('[SERVER SETUP]: Mounting /api routes...');
app.use('/api', apiRoutes);
console.log('[SERVER SETUP]: /api routes mounted.');

// ------------------------------------------------------------
// User management API (legacy) – mount directly on the root so
// absolute paths like "/api/users" resolve correctly.  When the
// modular router is hit at /api/* these would otherwise become
// "/api/api/users".  By attaching here we ensure backward-compat
// without touching the massive userRoutes file.
// ------------------------------------------------------------
// const { setupUserRoutes } = require('./userRoutes');
// const userRouter = express.Router();
// setupUserRoutes(userRouter);
// app.use('/', userRouter);

// console.log('[SERVER SETUP]: Mounting root message routes...');
// const { setupMessageRoutes } = require('./messageRoutes');
// setupMessageRoutes(app);
// console.log('[SERVER SETUP]: Root message routes mounted.');

// Preserve historical public image URLs (e.g. /images/uploads/badges/xyz.png)
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Add centralized error handler AFTER routes
app.use(errorHandler);

// Legacy compatibility: expose /am-admin and /am-educator at root (no /api prefix)
// app.get('/am-admin', async (req, res) => {
//   const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
//   if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
//   const isAdminFlag = await isUserAdminBySub(requestSub);
//   res.json({ isAdmin: isAdminFlag });
// });

// app.get('/am-educator', async (req, res) => {
//   const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
//   if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
//   const isEducatorFlag = await isUserEducatorBySub(requestSub);
//   res.json({ isEducator: isEducatorFlag });
// });

// ---------------------------------------------------------------------------
// NEW: API-prefixed aliases so axios (default baseURL = '/api') resolves the
//      role-lookup endpoints correctly without front-end changes.
// ---------------------------------------------------------------------------
app.get('/api/am-admin', async (req, res) => {
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isAdminFlag = await isUserAdminBySub(requestSub);
  res.json({ isAdmin: isAdminFlag });
});

app.get('/api/am-educator', async (req, res) => {
  const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
  if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });
  const isEducatorFlag = await isUserEducatorBySub(requestSub);
  res.json({ isEducator: isEducatorFlag });
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    console.log(`[SERVER SPA FALLBACK]: Serving index.html for ${req.method} ${req.originalUrl}`);
    res.sendFile(path.join(__dirname, 'client/build/index.html'));
  });
}

// Track unique devices instead of sockets
let deviceUsers = {}; // Maps device IDs to usernames
let deviceSockets = {}; // Maps device IDs to current socket ID
let socketToDevice = {}; // Maps socket IDs to device IDs
let deviceGameMap = {}; // Maps device IDs to active game IDs
let userVotedPolls = {}; // Track which polls each user has voted in

let onlineUsers = 0; // Track the number of online users
let userVotes = {}; // Track user votes for current poll by device ID 
let userPollsVoted = {}; // Track total polls voted by each user by device ID
let activeGames = {}; // Track active game sessions by UUID
let guestCounter = 1; // For guest naming

// Modified to accept targetGameId and emit to specific host if provided
async function sendUserList(targetGameId) { // Made async to potentially await DB calls if needed inside, though not strictly necessary with current changes
    let userListForGame = Object.entries(deviceUsers)
        .filter(([deviceId]) => !!deviceSockets[deviceId]) // filter out disconnected devices
        .map(([deviceId, userData]) => { // userData is now { name: originalUsername, dbId: numericDbId }
            let displayName = userData.name;
            if (typeof userData.name === 'string' && userData.name.includes('|')) {
                const parts = userData.name.split('|');
                displayName = parts[parts.length - 1] || userData.name;
            }

            return {
                id: userData.dbId || null,
                name: userData.name, // Original username (e.g., auth0_sub|DisplayName or guest name)
                display_name: displayName,
                gameId: deviceGameMap[deviceId] || null,
                pollsVoted: userPollsVoted[deviceId] || 0,
                selection: userVotes[deviceId] || null,
                hasMessages: false // Placeholder for future chat integration
            };
        });

    if (targetGameId) {
        // Filter list for the target game
        const filteredUserList = userListForGame.filter(user => user.gameId === targetGameId);
        
        const gameData = activeGames[targetGameId];
        if (gameData && gameData.hostSub) {
            let hostSocketFound = false;
            // deviceUsers maps deviceId to username/userSub.
            // We need to find the deviceId whose associated username/userSub is gameData.hostSub
            Object.entries(deviceUsers).forEach(([deviceId, userIdentifier]) => {
                if (userIdentifier.name === gameData.hostSub) { // Crucial comparison
                    const hostSocketId = deviceSockets[deviceId];
                    if (hostSocketId && io.sockets.sockets.get(hostSocketId)) {
                        console.log(`[sendUserList] Sending targeted user list for game ${targetGameId} to host ${gameData.hostSub} on socket ${hostSocketId}. Users: ${filteredUserList.length}`);
                        io.sockets.sockets.get(hostSocketId).emit('updateUserList', { gameId: targetGameId, users: filteredUserList, total: filteredUserList.length });
                        hostSocketFound = true;
                    }
                }
            });
            if (!hostSocketFound) {
                 console.warn(`[sendUserList] Host socket NOT FOUND for game ${targetGameId}, hostSub ${gameData.hostSub}. DeviceUsers dump:`, deviceUsers);
                 // Fallback if host not found: still emit targeted list but maybe to a game room if hosts join it?
                 // For now, this means the host won't get the list if identification fails.
            }
        } else {
            console.warn(`[sendUserList] No active game or hostSub found for gameId ${targetGameId}. Cannot send targeted user list.`);
        }
    } else {
        // Original behavior: broadcast to everyone (unfiltered list) if no specific gameId is targeted.
        // This path should ideally not be hit for game-specific updates.
        console.warn('[sendUserList] Broadcasting UNFILTERED user list to ALL clients (no targetGameId).');
        const fullUserList = userListForGame; // Send all users if no target game
        io.emit('updateUserList', { gameId: null, users: fullUserList, total: fullUserList.length });
    }
}

function getUniqueUserCount() {
    // Count only devices that currently have an active socket connection
    return Object.keys(deviceSockets).length;
}

io.on('connection', (socket) => {
    let currentSocketDeviceId = null; // Store deviceId for this specific socket connection

    console.log(`[Socket Connection] New connection: ${socket.id}`);

    socket.on('register user', async (data) => { // Made async to handle DB query
        try {
            let username, deviceId, gameId, userDbId = null;
            
            if (typeof data === 'string') { // Legacy
                username = data;
                deviceId = socket.id; 
                gameId = null;
                // Guests or legacy string-only users won't have a dbId immediately here
            } else {
                username = data.username; // This is typically userSub for authenticated users, or a generated name
                deviceId = data.deviceId;
                gameId = data.gameId || null; // gameId from student client
            }
            
            if (!deviceId) {
                console.error('[register user] Critical: No deviceId received. Aborting registration for socket:', socket.id, 'Data:', data);
                return;
            }
            currentSocketDeviceId = deviceId; // Associate deviceId with this socket session

            // If authenticated user, try to get their numeric DB ID
            if (username && typeof username === 'string' && username.includes('|')) {
                const auth0Sub = username.split('|')[0]; // Extract Auth0 sub part
                try {
                    const [userAccount] = await dbPromise.query('SELECT id FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [auth0Sub]);
                    if (userAccount && userAccount.length > 0) {
                        userDbId = userAccount[0].id;
                        console.log(`[register user] Fetched DB ID ${userDbId} for auth0_sub ${auth0Sub}`);
                    } else {
                        console.warn(`[register user] No UserAccounts entry found for auth0_sub ${auth0Sub}`);
                    }
                } catch (dbError) {
                    console.error(`[register user] DB error fetching ID for auth0_sub ${auth0Sub}:`, dbError);
                }
            }

            const isNewDevice = !deviceUsers[deviceId];
            
            // If it's an existing device but new socket, update socket mapping
            if (!isNewDevice && deviceSockets[deviceId] !== socket.id) {
                console.log(`[register user] Device ${deviceId.substring(0,8)} reconnected with new socket ${socket.id} (was ${deviceSockets[deviceId]})`);
            }
            
            deviceUsers[deviceId] = { name: username, dbId: userDbId }; // Store as object with name and dbId
            deviceSockets[deviceId] = socket.id;
            socketToDevice[socket.id] = deviceId;
            if (gameId) { // Only set gameId if provided (i.e., from a student joining a game)
              deviceGameMap[deviceId] = gameId;
            }
            
            if (username) {
                socket.join(username); // Join room by full username (may include display name)
                // Also join a room keyed only by the Auth0 sub (provider|uuid) so server-side
                // reward notifications that target pure subs reach this socket.
                if (typeof username === 'string' && username.includes('|')) {
                  const pureSub = username.split('|').slice(0, 2).join('|');
                  socket.join(pureSub);
                }
            }
            // All users should join a room for their specific gameId if available
            if (gameId) {
                socket.join(gameId);
                console.log(`[register user] Socket ${socket.id} (Device: ${deviceId.substring(0,8)}) joined game room: ${gameId}`);
            }
            
            console.log(`[register user] User: ${username} (Device: ${deviceId.substring(0,8)}, Socket: ${socket.id}) GameID: ${gameId || 'N/A'}`);
            
            if (isNewDevice) {
                onlineUsers++;
                // io.emit('user count', onlineUsers); // Consider if this is still needed or if total from userList is enough
                const timestamp = Date.now();
                // const message = `${username} has joined`; // System message might be too noisy
                // io.emit('system message', { message, timestamp });
                userPollsVoted[deviceId] = 0;
            }
            
            // When a user registers, send them the user list for their game.
            // If gameId is null (e.g. host before starting presentation), this won't send a targeted list.
            if (gameId) {
                sendUserList(gameId);
            }
        } catch (error) {
            console.error('[register user] Error:', error, 'Data:', data);
        }
    });

    socket.on('disconnect', () => {
        const deviceId = currentSocketDeviceId || socketToDevice[socket.id]; // Use socket-specific deviceId first
        if (deviceId) {
            console.log(`[Socket Disconnect] Socket ${socket.id} (Device: ${deviceId.substring(0,8)}) disconnected.`);
            
            // Check if this was the last active socket for this device
            let 다른socketMatchesDeviceId = false;
            for (const sockId in socketToDevice) {
                if (socketToDevice[sockId] === deviceId && sockId !== socket.id && io.sockets.sockets.get(sockId)) {
                    다른socketMatchesDeviceId = true;
                    break;
                }
            }

            if (!다른socketMatchesDeviceId) {
                console.log(`[Socket Disconnect] Device ${deviceId.substring(0,8)} fully disconnected (no other active sockets).`);
                const username = deviceUsers[deviceId].name;
                delete deviceSockets[deviceId]; // Remove active socket mapping

                // Do not delete deviceUsers[deviceId] or deviceGameMap[deviceId] immediately.
                // User might reconnect. Handle stale users later if needed.

                if (username) { // Only if user was actually registered
                    onlineUsers = Math.max(0, onlineUsers - 1);
                    // io.emit('user count', onlineUsers); // Consider if needed
                    // const timestamp = Date.now();
                    // const message = `${username} has left`;
                    // io.emit('system message', { message, timestamp });
                }
                
                // Update user list for the game the user was in, if any
                const gameId = deviceGameMap[deviceId];
                if (gameId) {
                    sendUserList(gameId);
                }
            } else {
                console.log(`[Socket Disconnect] Device ${deviceId.substring(0,8)} still has other active sockets. Not removing from deviceUsers/deviceGameMap yet.`);
            }
            delete socketToDevice[socket.id]; // Always remove current socket from mapping
        } else {
            console.log(`[Socket Disconnect] Socket ${socket.id} disconnected. No deviceId mapping found.`);
        }
    });

    // LivePolling
    socket.on('quiz response', (response) => {
        if (!currentQuiz || currentQuiz.id !== response.quizId) {
            console.log(`Vote rejected: ${response.quizId} doesn't match current quiz ID: ${currentQuiz ? currentQuiz.id : 'no quiz'}`);
            return;
        }
        
        // Get device ID from response or socket mapping
        const deviceId = response.deviceId || socketToDevice[socket.id] || socket.id;
        
        console.log(`Processing vote from device: ${deviceId.substring(0, 8)}...`);
        
        // Store the user's vote
        quizResponses[deviceId] = response.selectedOption;
        userVotes[deviceId] = currentQuiz.options[response.selectedOption];
        
        // Initialize tracking structures if needed
        if (!userVotedPolls[deviceId]) {
            userVotedPolls[deviceId] = new Set();
        }
        
        // Only increment polls voted count if this is the first vote for this poll
        if (!userVotedPolls[deviceId].has(response.quizId)) {
            userVotedPolls[deviceId].add(response.quizId);
            userPollsVoted[deviceId] = (userPollsVoted[deviceId] || 0) + 1;
            console.log(`Incremented polls voted count for ${deviceUsers[deviceId].name || 'Unknown'} to ${userPollsVoted[deviceId]}`);
        } else {
            console.log(`User already voted in this poll - not incrementing count`);
        }
        
        const username = deviceUsers[deviceId].name || 'Unknown User';
        console.log(`User ${username} responded with option ${response.selectedOption}`);
        
        // Notify everyone that a vote was received to trigger result updates
        io.emit('vote received', Object.keys(quizResponses).length);
        
        // Update user list with new selection information
        sendUserList(null);
    });
    
    socket.on('update quiz', (newQuiz) => {
        // Store in pending until educator sends it
        pendingQuiz = newQuiz;
        
        socket.emit('update success');
    });

    socket.on('send quiz', () => {
        if (!pendingQuiz) return;
        console.log('Sending quiz to all clients');
        pendingQuiz.startTime = Date.now();
        pendingQuiz.isActive = true; // Explicitly mark as active
        currentQuiz = pendingQuiz;
        pendingQuiz = null;
        
        // Clear any previous responses when starting a new poll
        quizResponses = {};
        userVotes = {};
        
        // Send new quiz and notify that poll has started in one operation
        io.emit('new quiz', currentQuiz);
        io.emit('poll started');
    });
    
    socket.on('end quiz', () => {
        if (!currentQuiz) return; // No quiz to end
        try {
            // Notify all clients that poll has ended
            io.emit('end quiz');
            io.emit('poll ended'); // Send both events for backward compatibility
            
            const results = calculateQuizResults(quizResponses, currentQuiz);
            const message = formatResultsMessage(results);
            io.emit('system message', { message, timestamp: Date.now() });
            
            // Mark the quiz as inactive but keep it for results
            if (currentQuiz) {
                currentQuiz.isActive = false;
            }
            
            // Update user list to keep selections visible
            sendUserList(null);
        } catch (error) {
            console.error('Error ending quiz:', error);
        }
    });
    
    socket.on('request results', () => {
        if (!currentQuiz) return;
        const results = calculateQuizResults(quizResponses, currentQuiz);

        const routes = Array.isArray(currentQuiz.options)
            ? currentQuiz.options.map((option) => ({ Title: option }))
            : [];

        socket.emit('results updated', results, Object.keys(quizResponses).length, routes);
    });

    socket.on('request current quiz', (data) => {
        // Track device ID if provided
        if (data && data.deviceId) {
            socketToDevice[socket.id] = data.deviceId;
            deviceSockets[data.deviceId] = socket.id;
        }
        
        if (currentQuiz) {
            // Only send the quiz as active if it's marked as active
            if (currentQuiz.isActive !== false) {
                socket.emit('current quiz', currentQuiz);
            } else {
                // If quiz exists but is inactive, send null to indicate no active quiz
                socket.emit('current quiz', null);
            }
        } else {
            socket.emit('current quiz', null);
        }
    });

    // New consolidated event handler
    socket.on('clear poll data', () => {
        // Clear responses and quiz data when moving to next encounter
        console.log('Clearing poll data');
        
        // Reset all quiz-related data
        quizResponses = {};
        userVotes = {};
        currentQuiz = null;
        
        // Notify clients that poll data has been cleared
        io.emit('poll data cleared');
        
        // Update user list to clear selections
        sendUserList(null);
    });

    // Simplify existing event handlers
    socket.on('poll started', () => {
        // Just forward the event - actual poll starting logic is in 'send quiz'
        io.emit('poll started');
    });
    
    socket.on('poll ended', () => {
        // Just forward the event - actual poll ending logic is in 'end quiz'
        io.emit('poll ended');
    });
    
    socket.on('show instant messages', () => {
        io.emit('show instant messages');
    });
    
    // Educator starts a presentation
    socket.on('start presentation', ({ gameId, hostSub }) => {
        if (!gameId || !hostSub) {
            console.error('[start presentation] Invalid data received:', { gameId, hostSub });
            return;
        }
        activeGames[gameId] = { 
            hostSub: hostSub, 
            presenterSocketId: socket.id, // Store the socket ID of the presenter
            encounterId: null, 
            poll: null, 
            users: {} 
        };

        // The host's deviceId should be in socketToDevice[socket.id]
        const hostDeviceId = socketToDevice[socket.id];
        if (hostDeviceId) {
            deviceUsers[hostDeviceId] = { name: hostSub, dbId: null }; // CRITICAL: Ensure host's userSub is stored against their deviceId
            deviceGameMap[hostDeviceId] = gameId; // Associate host's device with the game
            console.log(`[start presentation] Host ${hostSub} (Device: ${hostDeviceId.substring(0,8)}) started game ${gameId}. Storing userSub in deviceUsers.`);
            // Join the host to the game room as well
            socket.join(gameId);
            console.log(`[start presentation] Host socket ${socket.id} joined game room: ${gameId}`);
        } else {
            console.error(`[start presentation] CRITICAL: Could not find deviceId for host socket ${socket.id}. HostSub: ${hostSub}, Game: ${gameId}`);
        }

        console.log(`[start presentation] Presentation started. Game ID: ${gameId}, Host Sub: ${hostSub}`);
        // Emit to all clients that a presentation has started
        io.emit('presentation started', { gameId, hostSub });

        // Send an empty user list to the host initially.
        sendUserList(gameId);
    });

    // Client requests presenter info for a game (useful for late joiners)
    socket.on('get presenter', (gameId) => {
        try {
            // If a specific game ID was provided, use it, otherwise attempt to find the first active game
            let targetGameId = gameId;
            if (!targetGameId) {
                // Find any active game (pick the first). In future we could return a list, but for now one is enough.
                const activeEntry = Object.values(activeGames).find(g => g.isActive);
                if (activeEntry) {
                    targetGameId = activeEntry.id;
                }
            }

            if (!targetGameId) {
                // No active presentation found – inform the requester so they can continue waiting.
                socket.emit('presenter info', { gameId: null, hostSub: null, isActive: false });
                return;
            }

            const entry = activeGames[targetGameId] || {};
            const hostSub = entry.hostSub || null;
            const isActive = !!entry.isActive;

            socket.emit('presenter info', { gameId: targetGameId, hostSub, isActive });
        } catch (err) {
            console.error('Error handling get presenter:', err);
        }
    });

    // Educator ends entire presentation
    socket.on('presentation ended', (payload = {}) => {
        const { gameId } = payload;
        currentQuiz = null;
        pendingQuiz = null;
        quizResponses = {};
        userVotes = {};

        if (gameId && activeGames[gameId]) {
            activeGames[gameId].isActive = false;
        }

        // Notify all clients that the poll data is now cleared as part of ending the presentation
        io.emit('poll data cleared');

        // Clear any active instruction
        currentInstruction = null;

        io.emit('presentation ended', { gameId });
    });
    
    // Chat - message payload should include { conversationId, senderSub, body }
    socket.on('send message', async (msg) => {
        try {
            if (!msg || !msg.conversationId || !msg.senderSub || !msg.body) {
                console.warn('Malformed chat message received');
                return;
            }

            // Persist to DB
            const messageId = await addMessage(msg.conversationId, msg.senderSub, msg.body);

            const fullMessage = {
                id: messageId,
                conversationId: msg.conversationId,
                senderSub: msg.senderSub,
                body: msg.body,
                sentAt: new Date().toISOString()
            };

            // Fetch conversation participants (array of user subs)
            const participants = await getConversationParticipants(msg.conversationId);

            // Send the message to each participant's private room
            participants.forEach((sub) => {
                if (sub) {
                    io.to(sub).emit('receive message', fullMessage);
                }
            });
        } catch (err) {
            console.error('Error handling send message:', err);
        }
    });

    // Handle emoji reactions
    socket.on('react message', async (payload) => {
        try {
            console.log('Received reaction:', payload);
            const { conversationId, messageId, emoji, senderSub, senderName } = payload;
            if (!conversationId || !messageId || !emoji || !senderSub) return;

            // Store the reaction (this will replace any existing reaction from this user)
            await addReaction(messageId, senderSub, emoji);
            
            // Fetch a nice display name for the sender (fallback to email/sub)
            let displayName = senderName;
            try {
              const [nameRows] = await dbPromise.query(
                'SELECT COALESCE(display_name, nickname, name, email, auth0_sub) AS name FROM UserAccounts WHERE auth0_sub = ? LIMIT 1',
                [senderSub]
              );
              if (nameRows && nameRows.length) {
                displayName = nameRows[0].name;
              }
            } catch (err) {
              console.error('Could not fetch display name:', err);
            }

            // Override senderName in the payload so all clients see the display name
            payload.senderName = displayName;
            
            // Get the participant list
            const participants = await getConversationParticipants(conversationId);
            
            // The client already sent the best display name it had,
            // so we can just forward the payload as is
            console.log('Broadcasting reaction to participants:', participants);
            participants.forEach(sub => io.to(sub).emit('message reaction', payload));
        } catch (err) {
            console.error('Error handling reaction:', err);
        }
    });

    // -------- Reward notifications (XP / Badge) --------
    // Use unified event name `xp_awarded`
    socket.on('xp_awarded', (payload = {}) => {
      try {
        const { toSub } = payload;
        if (!toSub) return;
        // Emit only to the specific user's room so others don't see it
        io.to(toSub).emit('xp_awarded', payload);
      } catch (err) {
        console.error('Error handling xp_awarded event:', err);
      }
    });

    // Use unified event name `badge_awarded`
    socket.on('badge_awarded', (payload = {}) => {
      try {
        const { toSub } = payload;
        if (!toSub) return;
        io.to(toSub).emit('badge_awarded', payload);
      } catch (err) {
        console.error('Error handling badge_awarded event:', err);
      }
    });

    // Updated to handle game ID
    socket.on('TravelToID', (encounterId, gameId) => {
        console.log(`Travel to encounter: ${encounterId}, game: ${gameId || 'none'}`);
        
        // Update game state if provided
        if (gameId) {
            if (!activeGames[gameId]) {
                activeGames[gameId] = {
                    id: gameId,
                    currentEncounterId: encounterId,
                    connectedClients: [socket.id]
                };
                console.log(`Created new game session for ID: ${gameId}`);
            } else {
                activeGames[gameId].currentEncounterId = encounterId;
                
                // Add this socket to the game's connected clients if not already there
                if (!activeGames[gameId].connectedClients.includes(socket.id)) {
                    activeGames[gameId].connectedClients.push(socket.id);
                }
                
                console.log(`Updated game ${gameId} to encounter ${encounterId}`);
            }
            
            // Emit to all clients involved in this specific game
            io.emit('TravelToID', encounterId, gameId);
        } else {
            // Legacy behavior - broadcast to all clients
            io.emit('TravelToID', encounterId);
        }
    });
    
    // Track game sessions and manage encounter state
    socket.on('select encounter', (RouteID) => {
        console.log('travel to route: ' + RouteID);
        io.emit('TravelToID', RouteID); // Broadcast the message to all clients
    });

    // Capture socket errors to prevent crashes
    socket.on('error', (err) => {
        if (err.code === 'ECONNRESET') {
            console.warn('Socket ECONNRESET — ignoring');
            return;
        }
        console.error('Socket error:', err);
    });

    // Unified event name `instruction_broadcast`
    socket.on('instruction_broadcast', (payload = {}) => {
      try {
        // payload expected: { id, title, description, imageUrl }
        currentInstruction = payload; // Store as active instruction
        io.emit('instruction_broadcast', payload);
      } catch (err) {
        console.error('Error handling instruction_broadcast event:', err);
      }
    });

    // Unified event name `instruction_close`
    socket.on('instruction_close', () => {
      try {
        currentInstruction = null; // Clear active instruction
        io.emit('instruction_close');
      } catch (err) {
        console.error('Error handling instruction_close event:', err);
      }
    });

    // Client requests currently active instruction (for late joiners)
    socket.on('request current instruction', () => {
      try {
        if (currentInstruction) {
          // Send only to requesting socket
          socket.emit('instruction_broadcast', currentInstruction);
        }
      } catch (err) {
        console.error('Error handling request current instruction:', err);
      }
    });

    // Client requests the current encounter ID for a given (or active) game
    socket.on('request current encounter', (gameId) => {
        try {
            // Determine which game to look up – prefer the supplied ID, otherwise any active game
            let targetGameId = gameId;
            if (!targetGameId) {
                const activeEntry = Object.values(activeGames).find(g => g.isActive);
                if (activeEntry) {
                    targetGameId = activeEntry.id;
                }
            }

            if (!targetGameId || !activeGames[targetGameId]) {
                // No active game – nothing to send back
                socket.emit('current encounter', { gameId: null, encounterId: null });
                return;
            }

            const encounterId = activeGames[targetGameId].currentEncounterId || null;
            socket.emit('current encounter', { gameId: targetGameId, encounterId });
        } catch (err) {
            console.error('Error handling request current encounter:', err);
        }
    });

    socket.on('awardXP', async (payload) => {
        try {
            const { userId, amount, reason, awardedBy, gameId } = payload;
            if (!userId || amount == null || !awardedBy || !gameId) {
                console.error('[awardXP] Invalid payload:', payload);
                // Optionally, emit an error back to the sender (educator)
                // socket.emit('awardXP_error', { message: 'Invalid payload' });
                return;
            }

            const targetUserSub = userId.includes('|') ? userId.split('|').slice(0, 2).join('|') : userId;
            const xpAmount = parseInt(amount, 10);

            if (isNaN(xpAmount)) {
                console.error('[awardXP] Invalid XP amount:', amount);
                return;
            }

            // Update database
            const updateUserQuery = 'UPDATE UserAccounts SET xp_points = xp_points + ? WHERE auth0_sub = ?';
            const [updateResult] = await dbPromise.query(updateUserQuery, [xpAmount, targetUserSub]);

            if (updateResult.affectedRows > 0) {
                console.log(`[awardXP] Awarded ${xpAmount} XP to ${targetUserSub}. Reason: ${reason}. Awarded by: ${awardedBy} in game ${gameId}`);
                
                // Fetch the user's new total XP to send in the notification
                const [userAccountRows] = await dbPromise.query('SELECT xp_points, display_name FROM UserAccounts WHERE auth0_sub = ?', [targetUserSub]);
                const updatedUserAccount = userAccountRows[0];

                // Notify the specific user
                const notificationPayload = {
                    toSub: targetUserSub,
                    xpAwarded: xpAmount,
                    reason,
                    awardedBy,
                    gameId,
                    newXP: updatedUserAccount ? updatedUserAccount.xp_points : null,
                    newLevel: updatedUserAccount ? updatedUserAccount.level : null,
                    awardedToDisplayName: updatedUserAccount ? updatedUserAccount.display_name : targetUserSub
                };
                io.to(targetUserSub).emit('xp_awarded', notificationPayload);

                // Optionally, notify the educator that the award was successful
                // socket.emit('awardXP_success', { userId: targetUserSub, amount: xpAmount });
            } else {
                console.warn(`[awardXP] User not found or XP not updated for ${targetUserSub}. Payload:`, payload);
                // socket.emit('awardXP_error', { message: 'User not found or XP not updated' });
            }
        } catch (error) {
            console.error('[awardXP] Error awarding XP:', error, 'Payload:', payload);
            // socket.emit('awardXP_error', { message: 'Internal server error while awarding XP' });
        }
    });

    socket.on('awardXPToAll', async (payload) => {
        try {
            const { gameId, encounterId, amount, awardedBy } = payload;
            if (!gameId || amount == null || !awardedBy) {
                console.error('[awardXPToAll] Invalid payload:', payload);
                return;
            }

            const xpAmount = parseInt(amount, 10);
            if (isNaN(xpAmount)) {
                console.error('[awardXPToAll] Invalid XP amount:', amount);
                return;
            }

            // Find all users in the specified game
            const userDeviceIdsInGame = Object.entries(deviceGameMap)
                .filter(([deviceId, gid]) => gid === gameId)
                .map(([deviceId]) => deviceId);

            if (userDeviceIdsInGame.length === 0) {
                console.warn(`[awardXPToAll] No users found in game ${gameId} to award XP to.`);
                return;
            }

            const userSubsInGame = userDeviceIdsInGame.map(deviceId => deviceUsers[deviceId].name).filter(Boolean);
            const uniqueUserSubsInGame = [...new Set(userSubsInGame)]; // Ensure unique userSubs

            if (uniqueUserSubsInGame.length === 0) {
                console.warn(`[awardXPToAll] No valid userSubs found in game ${gameId} after filtering. Device Map:`, deviceGameMap, 'Device Users:', deviceUsers);
                return;
            }

            // Update database for all these users
            // Note: Using a loop for individual updates. For very large numbers, a single bulk update or transaction might be better.
            let awardedCount = 0;
            for (const targetUserSub of uniqueUserSubsInGame) {
                const pureTargetSub = targetUserSub.includes('|') ? targetUserSub.split('|').slice(0, 2).join('|') : targetUserSub;
                const updateUserQuery = 'UPDATE UserAccounts SET xp_points = xp_points + ? WHERE auth0_sub = ?';
                const [updateResult] = await dbPromise.query(updateUserQuery, [xpAmount, pureTargetSub]);
                if (updateResult.affectedRows > 0) {
                    awardedCount++;
                    console.log(`[awardXPToAll] Awarded ${xpAmount} XP to ${pureTargetSub} in game ${gameId}.`);
                    
                    // Fetch new total XP for notification
                    const [userAccountRows] = await dbPromise.query('SELECT xp_points, display_name FROM UserAccounts WHERE auth0_sub = ?', [pureTargetSub]);
                    const updatedUserAccount = userAccountRows[0];

                    // Notify the specific user
                    const notificationPayload = {
                        toSub: pureTargetSub,
                        xpAwarded: xpAmount,
                        reason: 'Bulk award for game activity',
                        awardedBy,
                        gameId,
                        encounterId,
                        newXP: updatedUserAccount ? updatedUserAccount.xp_points : null,
                        newLevel: updatedUserAccount ? updatedUserAccount.level : null,
                        awardedToDisplayName: updatedUserAccount ? updatedUserAccount.display_name : pureTargetSub
                    };
                    io.to(pureTargetSub).emit('xp_awarded', notificationPayload);
                }
            }
            console.log(`[awardXPToAll] Completed. Awarded XP to ${awardedCount} users in game ${gameId}.`);
            // Optionally, notify educator of bulk award success
            // socket.emit('awardXPToAll_success', { gameId, count: awardedCount, amount: xpAmount });

        } catch (error) {
            console.error('[awardXPToAll] Error awarding XP to all:', error, 'Payload:', payload);
            // socket.emit('awardXPToAll_error', { message: 'Internal server error', gameId });
        }
    });

    socket.on('awardBadge', async (payload) => {
        try {
            const { userId, badgeId, gameId, encounterId, awardedBy } = payload;
            if (!userId || !badgeId || !awardedBy || !gameId) {
                console.error('[awardBadge] Invalid payload:', payload);
                return;
            }

            const targetUserAuth0Sub = userId.includes('|') ? userId.split('|').slice(0, 2).join('|') : userId;
            const numericBadgeId = parseInt(badgeId, 10);

            if (isNaN(numericBadgeId)) {
                console.error('[awardBadge] Invalid badgeId:', badgeId);
                return;
            }

            // 1. Fetch UserAccounts.id using targetUserAuth0Sub
            const [userAccountRows] = await dbPromise.query('SELECT id, display_name FROM UserAccounts WHERE auth0_sub = ?', [targetUserAuth0Sub]);
            if (!userAccountRows || userAccountRows.length === 0) {
                console.warn(`[awardBadge] No UserAccount found for auth0_sub ${targetUserAuth0Sub}. Cannot award badge.`);
                // Optionally emit an error back to educator
                // socket.emit('awardBadge_error', { message: `User ${targetUserAuth0Sub} not found.` });
                return;
            }
            const userAccountId = userAccountRows[0].id; // Numeric ID for UserBadges
            const awardedToDisplayName = userAccountRows[0].display_name || targetUserAuth0Sub;


            // Check if user already has the badge using userAccountId
            const [existingBadges] = await dbPromise.query('SELECT id FROM UserBadges WHERE user_id = ? AND badge_id = ?', [userAccountId, numericBadgeId]);
            if (existingBadges.length > 0) {
                console.log(`[awardBadge] User ${targetUserAuth0Sub} (ID: ${userAccountId}) already has badge ${numericBadgeId}.`);
                // socket.emit('awardBadge_error', { message: 'User already has this badge' });
                return;
            }

            // Insert new badge for user using userAccountId, only include existing columns
            const insertQuery = 'INSERT INTO UserBadges (user_id, badge_id, date_earned) VALUES (?, ?, NOW())';
            const [insertResult] = await dbPromise.query(insertQuery, [userAccountId, numericBadgeId]);

            if (insertResult.affectedRows > 0) {
                console.log(`[awardBadge] Awarded badge ${numericBadgeId} to ${targetUserAuth0Sub} (ID: ${userAccountId}) by ${awardedBy} in game ${gameId}.`);

                // Fetch badge details for notification
                const [badgeDetailsRows] = await dbPromise.query(
                    'SELECT b.Title, b.Description, i.FileNameServer AS ImageFileName FROM Badges b LEFT JOIN Images i ON b.Image = i.ID WHERE b.ID = ?',
                    [numericBadgeId]
                );
                const badgeDetails = badgeDetailsRows[0];

                // Notify the specific user (using their Auth0 Sub for socket room)
                const notificationPayload = {
                    toSub: targetUserAuth0Sub, // Target socket room with Auth0Sub
                    badgeId: numericBadgeId,
                    badgeName: badgeDetails ? badgeDetails.Title : 'New Badge!',
                    badgeDescription: badgeDetails ? badgeDetails.Description : '',
                    badgeImage: badgeDetails && badgeDetails.ImageFileName ? `/images/uploads/badges/${badgeDetails.ImageFileName}` : null,
                    awardedBy,
                    gameId,
                    encounterId,
                    awardedToDisplayName // Added for consistency with XP
                };
                io.to(targetUserAuth0Sub).emit('badge_awarded', notificationPayload);
                // socket.emit('awardBadge_success', { userId: targetUserAuth0Sub, badgeId: numericBadgeId });
            } else {
                console.warn(`[awardBadge] Badge not awarded for ${targetUserAuth0Sub} (ID: ${userAccountId}). Payload:`, payload);
                // socket.emit('awardBadge_error', { message: 'Badge could not be awarded' });
            }
        } catch (error) {
            console.error('[awardBadge] Error awarding badge:', error, 'Payload:', payload);
            // socket.emit('awardBadge_error', { message: 'Internal server error', error: error.message });
        }
    });

    socket.on('awardBadgeToAll', async (payload) => {
        try {
            const { badgeId, gameId, encounterId, awardedBy } = payload;
            if (!badgeId || !awardedBy || !gameId) {
                console.error('[awardBadgeToAll] Invalid payload:', payload);
                return;
            }

            const numericBadgeId = parseInt(badgeId, 10);
            if (isNaN(numericBadgeId)) {
                console.error('[awardBadgeToAll] Invalid badgeId:', badgeId);
                return;
            }

            const userDeviceIdsInGame = Object.entries(deviceGameMap)
                .filter(([deviceId, gid]) => gid === gameId)
                .map(([deviceId]) => deviceId);

            if (userDeviceIdsInGame.length === 0) {
                console.warn(`[awardBadgeToAll] No users found in game ${gameId} to award badge to.`);
                return;
            }

            const userAuth0SubsInGameWithName = userDeviceIdsInGame.map(deviceId => deviceUsers[deviceId]?.name).filter(name => name && name.includes('|'));
            const uniqueUserAuth0SubsInGame = [...new Set(userAuth0SubsInGameWithName.map(name => name.split('|').slice(0, 2).join('|')))];


             if (uniqueUserAuth0SubsInGame.length === 0) {
                console.warn(`[awardBadgeToAll] No valid user Auth0 subs found in game ${gameId} after filtering.`);
                return;
            }

            // Fetch badge details once for notification
            const [badgeDetailsRows] = await dbPromise.query(
                'SELECT b.Title, b.Description, i.FileNameServer AS ImageFileName FROM Badges b LEFT JOIN Images i ON b.Image = i.ID WHERE b.ID = ?',
                [numericBadgeId]
            );
            const badgeDetails = badgeDetailsRows[0];

            let awardedCount = 0;
            for (const targetUserAuth0Sub of uniqueUserAuth0SubsInGame) {
                // 1. Fetch UserAccounts.id using targetUserAuth0Sub
                const [userAccountRows] = await dbPromise.query('SELECT id, display_name FROM UserAccounts WHERE auth0_sub = ?', [targetUserAuth0Sub]);
                if (!userAccountRows || userAccountRows.length === 0) {
                    console.warn(`[awardBadgeToAll] No UserAccount found for auth0_sub ${targetUserAuth0Sub}. Skipping badge award for this user.`);
                    continue;
                }
                const userAccountId = userAccountRows[0].id; // Numeric ID for UserBadges
                const awardedToDisplayName = userAccountRows[0].display_name || targetUserAuth0Sub;
                
                const [existingBadges] = await dbPromise.query('SELECT id FROM UserBadges WHERE user_id = ? AND badge_id = ?', [userAccountId, numericBadgeId]);
                if (existingBadges.length > 0) {
                    console.log(`[awardBadgeToAll] User ${targetUserAuth0Sub} (ID: ${userAccountId}) already has badge ${numericBadgeId}, skipping.`);
                    continue; // Skip if user already has it
                }

                // Insert new badge for user using userAccountId, only include existing columns
                const insertQuery = 'INSERT INTO UserBadges (user_id, badge_id, date_earned) VALUES (?, ?, NOW())';
                const [insertResult] = await dbPromise.query(insertQuery, [userAccountId, numericBadgeId]);

                if (insertResult.affectedRows > 0) {
                    awardedCount++;
                    console.log(`[awardBadgeToAll] Awarded badge ${numericBadgeId} to ${targetUserAuth0Sub} (ID: ${userAccountId}) in game ${gameId}.`);
                    const notificationPayload = {
                        toSub: targetUserAuth0Sub, // Target socket room with Auth0Sub
                        badgeId: numericBadgeId,
                        badgeName: badgeDetails ? badgeDetails.Title : 'New Badge!',
                        badgeDescription: badgeDetails ? badgeDetails.Description : '',
                        badgeImage: badgeDetails && badgeDetails.ImageFileName ? `/images/uploads/badges/${badgeDetails.ImageFileName}` : null,
                        awardedBy,
                        gameId,
                        encounterId,
                        awardedToDisplayName // Added for consistency with XP
                    };
                    io.to(targetUserAuth0Sub).emit('badge_awarded', notificationPayload);
                }
            }
            console.log(`[awardBadgeToAll] Completed. Awarded badge ${numericBadgeId} to ${awardedCount} users in game ${gameId}.`);
            // socket.emit('awardBadgeToAll_success', { gameId, count: awardedCount, badgeId: numericBadgeId });

        } catch (error) {
            console.error('[awardBadgeToAll] Error awarding badge to all:', error, 'Payload:', payload);
            // socket.emit('awardBadgeToAll_error', { message: 'Internal server error', gameId });
        }
    });
});

// Modular API routes
app.use('/api/users', userRoutesApi);
app.use('/api/messages', messageRoutesApi);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} on all networks`));







