// My includes
const { db, dbPromise } = require('./db');
const apiRoutes = require('./src/routes');
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
const userRoutesApi = require('./src/routes/userRoutesApi');
const messageRoutesApi = require('./src/routes/messageRoutesApi');
const journalRoutesApi = require('./src/routes/journalRoutesApi');

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

function sendUserList() {
    // Only include users that currently have an active socket associated with their device ID
    const userList = Object.entries(deviceUsers)
        .filter(([deviceId]) => !!deviceSockets[deviceId]) // filter out disconnected devices
        .sort(([deviceIdA, nameA], [deviceIdB, nameB]) => {
            const isGuestA = nameA.toLowerCase().startsWith('guest');
            const isGuestB = nameB.toLowerCase().startsWith('guest');
            if (isGuestA === isGuestB) return nameA.localeCompare(nameB);
            return isGuestA ? 1 : -1; // Guests last
        })
        .map(([deviceId, username]) => {
            // Derive a human-readable display name. If the username string contains pipe-delimited
            // segments (e.g. "auth0|xyz|Jane Doe"), use the last segment. Otherwise use the whole string.
            let displayName = username;
            if (typeof username === 'string' && username.includes('|')) {
                const parts = username.split('|');
                displayName = parts[parts.length - 1] || username;
            }

            return {
                id: deviceId,
                name: username,        // keep original identifier for actions requiring sub
                display_name: displayName,
                gameId: deviceGameMap[deviceId] || null,
                pollsVoted: userPollsVoted[deviceId] || 0,
                selection: userVotes[deviceId] || null,
                hasMessages: false
            };
        });

    io.emit('update user list', userList);
}

function getUniqueUserCount() {
    // Count only devices that currently have an active socket connection
    return Object.keys(deviceSockets).length;
}

io.on('connection', (socket) => {
    // Socket connection doesn't increment user count anymore
    // User count will be incremented only when a new device ID is registered

    socket.on('register user', (data) => {
        try {
            let username, deviceId, gameId;
            
            // Handle both string (legacy) and object format
            if (typeof data === 'string') {
                username = data;
                // No device ID, use socket ID as fallback (legacy support)
                deviceId = socket.id; 
                gameId = null;
            } else {
                username = data.username;
                deviceId = data.deviceId;
                gameId = data.gameId || null;
            }
            
            const isNewDevice = !deviceUsers[deviceId];
            
            // Store device mapping (username here represents userSub when available)
            deviceUsers[deviceId] = username;
            deviceSockets[deviceId] = socket.id;
            socketToDevice[socket.id] = deviceId;
            deviceGameMap[deviceId] = gameId;
            
            // Join a private room for this user (using userSub/username as room id)
            if (username) {
                socket.join(username);
            }
            
            console.log(`User registered: ${username} with device ID: ${deviceId.substring(0, 8)}...`);
            
            // Only increment count for new devices
            if (isNewDevice) {
                onlineUsers++;
                io.emit('user count', onlineUsers);
                
                const timestamp = Date.now();
                const message = `${username} has joined`;
                io.emit('system message', { message, timestamp });
                
                // Initialize polls voted count for new user
                userPollsVoted[deviceId] = 0;
            }
            
            // Update user list
            sendUserList();
        } catch (error) {
            console.error('Error registering user:', error);
        }
    });

    socket.on('disconnect', () => {
        try {
            // Get device ID for this socket
            const deviceId = socketToDevice[socket.id];
            
            if (deviceId) {
                console.log(`Socket disconnected for device: ${deviceId.substring(0, 8)}...`);
                
                // Clean up socket mapping
                delete socketToDevice[socket.id];
                
                // Only remove device if this was the last socket for it
                if (deviceSockets[deviceId] === socket.id) {
                    // Socket is the registered socket for this device
                    delete deviceSockets[deviceId];
                    delete deviceGameMap[deviceId];
                    
                    // We don't immediately remove the user, allowing for reconnection
                    // Keep the user in deviceUsers and keep their votes/data
                    
                    // Notify about disconnect without removing user
                    console.log(`User ${deviceUsers[deviceId]} temporarily disconnected`);
                }
            } else {
                console.log('Socket disconnected - no device ID found');
            }
            
            // Update user count based on actual device count
            onlineUsers = getUniqueUserCount();
            io.emit('user count', onlineUsers);
            
            // Update user list
            sendUserList();
        } catch (error) {
            console.error('Error handling disconnect:', error);
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
            console.log(`Incremented polls voted count for ${deviceUsers[deviceId] || 'Unknown'} to ${userPollsVoted[deviceId]}`);
        } else {
            console.log(`User already voted in this poll - not incrementing count`);
        }
        
        const username = deviceUsers[deviceId] || 'Unknown User';
        console.log(`User ${username} responded with option ${response.selectedOption}`);
        
        // Notify everyone that a vote was received to trigger result updates
        io.emit('vote received', Object.keys(quizResponses).length);
        
        // Update user list with new selection information
        sendUserList();
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
            sendUserList();
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
        sendUserList();
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
    socket.on('start presentation', (payload = {}) => {
        try {
            const { gameId, hostSub } = payload;
            if (!gameId || !hostSub) {
                console.warn('start presentation event missing gameId or hostSub');
                return;
            }

            /*
             * =============================================================
             * RESET ALL PRIOR GAME STATE – single-presentation mode
             * =============================================================
             *  • Mark every previously stored activeGame as inactive so they
             *    will be ignored by late-joining displays/clients.
             *  • Clear any lingering quiz / poll data so the new run begins
             *    with a clean slate.
             */
            Object.keys(activeGames).forEach(oldId => {
                if (activeGames[oldId]) {
                    activeGames[oldId].isActive = false;
                }
            });

            // Flush poll state
            currentQuiz     = null;
            pendingQuiz     = null;
            quizResponses   = {};
            userVotes       = {};
            userVotedPolls  = {};
            userPollsVoted  = {};

            // Tell every client to clear stale poll data
            io.emit('poll data cleared');

            // Ensure fresh activeGames entry for this presentation
            activeGames[gameId] = { id: gameId, connectedClients: [], currentEncounterId: null };
            activeGames[gameId].hostSub = hostSub;
            activeGames[gameId].isActive = true;

            // Broadcast to all clients so they know who the presenter is
            io.emit('presentation started', { gameId, hostSub });
        } catch (err) {
            console.error('Error handling start presentation:', err);
        }
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
    // Relay XP award events to the intended recipient's private room
    socket.on('xp awarded', (payload = {}) => {
      try {
        const { toSub } = payload;
        if (!toSub) return;
        // Emit only to the specific user's room so others don't see it
        io.to(toSub).emit('xp awarded', payload);
      } catch (err) {
        console.error('Error handling xp awarded event:', err);
      }
    });

    // Relay Badge award events to the intended recipient's private room
    socket.on('badge awarded', (payload = {}) => {
      try {
        const { toSub } = payload;
        if (!toSub) return;
        io.to(toSub).emit('badge awarded', payload);
      } catch (err) {
        console.error('Error handling badge awarded event:', err);
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

    // Relay Student Instruction broadcast to all connected clients
    socket.on('instruction broadcast', (payload = {}) => {
      try {
        // payload expected: { id, title, description, imageUrl }
        currentInstruction = payload; // Store as active instruction
        io.emit('instruction broadcast', payload);
      } catch (err) {
        console.error('Error handling instruction broadcast event:', err);
      }
    });

    // Relay Student Instruction close events to all connected clients
    socket.on('instruction close', () => {
      try {
        currentInstruction = null; // Clear active instruction
        io.emit('instruction close');
      } catch (err) {
        console.error('Error handling instruction close event:', err);
      }
    });

    // Client requests currently active instruction (for late joiners)
    socket.on('request current instruction', () => {
      try {
        if (currentInstruction) {
          // Send only to requesting socket
          socket.emit('instruction broadcast', currentInstruction);
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
});

// Modular API routes
app.use('/api/users', userRoutesApi);
app.use('/api/messages', messageRoutesApi);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} on all networks`));







