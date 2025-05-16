// Message operations for chat/messaging feature
// Uses same MySQL connection pattern as other *Operations files
const { db } = require('./db');

/*
  Conversation / Messaging schema (MySQL):

  Conversations
  -------------
  ID               INT AUTO_INCREMENT PRIMARY KEY
  IsGroup          TINYINT(1) NOT NULL DEFAULT 0            -- 0 = direct (2-party), 1 = group chat
  Created_At       DATETIME DEFAULT CURRENT_TIMESTAMP

  ConversationParticipants
  -----------------------
  ID               INT AUTO_INCREMENT PRIMARY KEY
  Conversation_ID  INT NOT NULL
  User_Sub         VARCHAR(255) NOT NULL                    -- Auth0 user sub (unique user identifier)
  Joined_At        DATETIME DEFAULT CURRENT_TIMESTAMP
  Last_Read_Message_ID INT DEFAULT NULL                     -- Tracks last read message for this user
  FOREIGN KEY (Conversation_ID) REFERENCES Conversations(ID) ON DELETE CASCADE
  INDEX (User_Sub), INDEX (Conversation_ID, User_Sub)

  Messages
  --------
  ID               INT AUTO_INCREMENT PRIMARY KEY
  Conversation_ID  INT NOT NULL
  Sender_Sub       VARCHAR(255) NOT NULL                    -- Auth0 sub of sender
  Body             TEXT NOT NULL
  Sent_At          DATETIME DEFAULT CURRENT_TIMESTAMP
  FOREIGN KEY (Conversation_ID) REFERENCES Conversations(ID) ON DELETE CASCADE
  INDEX (Conversation_ID, Sent_At)
*/

// Helper to run query returning promise
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.query(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

/**
 * Create (or fetch existing) direct conversation between two users
 * Returns the conversation ID.
 */
async function getOrCreateDirectConversation(userSubA, userSubB) {
  // Normalise values first to avoid subtle whitespace / case differences that
  // would trick the strict equality check below and lead to duplicate
  // conversations being created for what is effectively the same user.
  const normalize = (sub) => (sub || '').trim();

  const subA = normalize(userSubA);
  const subB = normalize(userSubB);

  // Self-chat (subA === subB) — treat as a 1-participant conversation.
  if (subA === subB) {
    // Look for an existing direct conversation that only has THIS user as participant
    const selfQuery = `
      SELECT c.ID
      FROM Conversations c
      JOIN ConversationParticipants p ON p.Conversation_ID = c.ID
      WHERE c.IsGroup = 0
        AND p.User_Sub = ?
      GROUP BY c.ID
      HAVING COUNT(DISTINCT p.User_Sub) = 1
      LIMIT 1`;

    const existingSelf = await runQuery(selfQuery, [subA]);
    if (existingSelf.length) return existingSelf[0].ID;

    // Create new 1-participant conversation
    const convoRes = await runQuery('INSERT INTO Conversations (IsGroup) VALUES (0)');
    const convoId = convoRes.insertId;
    await runQuery('INSERT IGNORE INTO ConversationParticipants (Conversation_ID, User_Sub) VALUES (?, ?)', [convoId, subA]);
    return convoId;
  }

  // Otherwise (regular two-party conversation)
  const [small, big] = [subA, subB].sort();

  const existingQuery = `
    SELECT c.ID
    FROM Conversations c
    JOIN ConversationParticipants p ON p.Conversation_ID = c.ID
    WHERE c.IsGroup = 0
      AND p.User_Sub IN (?, ?)
    GROUP BY c.ID
    HAVING COUNT(DISTINCT p.User_Sub) = 2
    LIMIT 1`;

  const existing = await runQuery(existingQuery, [small, big]);
  if (existing.length) return existing[0].ID;

  const convoRes = await runQuery('INSERT INTO Conversations (IsGroup) VALUES (0)');
  const convoId = convoRes.insertId;
  await runQuery('INSERT IGNORE INTO ConversationParticipants (Conversation_ID, User_Sub) VALUES (?, ?), (?, ?)', [convoId, small, convoId, big]);
  return convoId;
}

/** Add a new message */
async function addMessage(conversationId, senderSub, body) {
  const msgRes = await runQuery('INSERT INTO Messages (Conversation_ID, Sender_Sub, Body) VALUES (?, ?, ?)', [conversationId, senderSub, body]);
  const msgId = msgRes.insertId;

  // Also mark this message as read for the sender immediately, so their own
  // messages are never counted as unread.
  await runQuery(
    'UPDATE ConversationParticipants SET Last_Read_Message_ID = ? WHERE Conversation_ID = ? AND User_Sub = ?',
    [msgId, conversationId, senderSub]
  );

  return msgId;
}

/** Store or update a reaction */
async function addReaction(messageId, reactorSub, emoji) {
  // First delete any existing reaction from this user
  await runQuery('DELETE FROM MessageReactions WHERE Message_ID = ? AND Reactor_Sub = ?', 
    [messageId, reactorSub]);
  
  // Then insert the new reaction
  const query = `INSERT INTO MessageReactions (Message_ID, Reactor_Sub, Emoji)
                 VALUES (?, ?, ?)`;
  await runQuery(query, [messageId, reactorSub, emoji]);
}

/** Fetch messages for a conversation (newest first, limit) */
async function getConversationMessages(conversationId, limit = 50, beforeId = null) {
  // Get messages with basic reaction info (for backward compatibility)
  let query = `SELECT m.*, 
                      GROUP_CONCAT(DISTINCT r.Emoji SEPARATOR ',') as old_reaction_format
               FROM Messages m
               LEFT JOIN MessageReactions r ON r.Message_ID = m.ID
               WHERE m.Conversation_ID = ?`;
               
  const params = [conversationId];
  
  if (beforeId) {
    query += ' AND m.ID < ?';
    params.push(beforeId);
  }
  
  query += ' GROUP BY m.ID ORDER BY m.ID DESC LIMIT ?';
  params.push(parseInt(limit, 10));
  
  const messages = await runQuery(query, params);
  
  // For each message, get its reactions with detailed user info
  for (const msg of messages) {
    const messageId = msg.ID || msg.id;
    const reactionQuery = `
      SELECT r.Emoji AS emoji, r.Reactor_Sub AS userSub, 
             COALESCE(u.display_name, u.nickname, u.name, u.email, 'Unknown User') AS userName
      FROM MessageReactions r
      LEFT JOIN UserAccounts u ON u.auth0_sub = r.Reactor_Sub
      WHERE r.Message_ID = ?`;
    
    const reactions = await runQuery(reactionQuery, [messageId]);
    
    if (reactions.length > 0) {
      // Store reactions in new JSON format
      msg.reaction = JSON.stringify(reactions);
    } else if (msg.old_reaction_format) {
      // If we have old-format reactions but no detailed ones, create a compatible format
      const emojis = msg.old_reaction_format.split(',');
      const legacyReactions = emojis.map(emoji => ({
        emoji,
        userSub: 'unknown', // We don't know the user info for legacy reactions
        userName: 'User'
      }));
      msg.reaction = JSON.stringify(legacyReactions);
    }
    
    // Clean up temporary field
    delete msg.old_reaction_format;
  }
  
  return messages.reverse(); // return in ascending order
}

/** Fetch list of conversations for a user with last message + unread count */
async function getUserConversations(userSub) {
  // Add SQL debug output
  console.log(`Getting conversations for user ${userSub}`);
  
  const query = `
    SELECT c.ID              AS conversationId,
           c.IsGroup         AS isGroup,
           MAX(m.ID)         AS lastMessageId,
           MAX(CASE WHEN m.Sender_Sub <> ? THEN m.Sent_At ELSE NULL END) AS lastReceivedTime,
           MAX(m.Sent_At)    AS lastMessageTime,
           COUNT(CASE 
                 WHEN m.ID > COALESCE(p.Last_Read_Message_ID, 0)
                      AND m.Sender_Sub <> ? THEN 1 
                 ELSE NULL END) AS unreadCount
    FROM ConversationParticipants p
    JOIN Conversations c ON c.ID = p.Conversation_ID
    LEFT JOIN Messages m ON m.Conversation_ID = c.ID
    WHERE p.User_Sub = ?
    GROUP BY c.ID`;

  const results = await runQuery(query, [userSub, userSub, userSub]);
  console.log('Conversation results:', results);
  return results;
}

/** Mark messages as read up to latest message for user */
async function markConversationRead(conversationId, userSub, lastMessageId) {
  const query = `UPDATE ConversationParticipants SET Last_Read_Message_ID = ? WHERE Conversation_ID = ? AND User_Sub = ?`;
  await runQuery(query, [lastMessageId, conversationId, userSub]);
}

/** Return array of user subs participating in conversation */
async function getConversationParticipants(conversationId) {
  const rows = await runQuery('SELECT User_Sub FROM ConversationParticipants WHERE Conversation_ID = ?', [conversationId]);
  return rows.map(r => r.User_Sub);
}

/** Get other participant (for direct chat) */
async function getOtherParticipant(conversationId, meSub) {
  // First attempt: join via ConversationParticipants (covers the usual case)
  let rows = await runQuery(
    `SELECT COALESCE(u.display_name, u.nickname, u.name, u.email, 'Unknown User') AS name, u.auth0_sub AS sub
     FROM ConversationParticipants p
     JOIN UserAccounts u ON u.auth0_sub = p.User_Sub
     WHERE p.Conversation_ID = ? AND p.User_Sub <> ?
     LIMIT 1`,
    [conversationId, meSub]
  );

  if (rows && rows.length) {
    return rows[0];
  }

  // Fallback path – the join failed (possible data mismatch). Fetch participant SUB first.
  const otherRows = await runQuery(
    'SELECT User_Sub FROM ConversationParticipants WHERE Conversation_ID = ? AND User_Sub <> ? LIMIT 1',
    [conversationId, meSub]
  );

  if (!otherRows || !otherRows.length) {
    return null; // Should not happen, but play safe
  }

  const sub = otherRows[0].User_Sub;

  // Attempt to fetch user record directly
  const userRows = await runQuery(
    `SELECT COALESCE(display_name, nickname, name, email, 'Unknown User') AS name
     FROM UserAccounts WHERE auth0_sub = ? LIMIT 1`,
    [sub]
  );

  if (userRows && userRows.length) {
    return { name: userRows[0].name, sub };
  }

  // If still not found, return generic label (but never the raw sub)
  return { name: sub === 'SYSTEM' ? 'System' : 'Unknown User', sub };
}

/**
 * Send a direct message from the special "SYSTEM" sender to a single user.
 * Optionally provide a socket.io instance to emit the real-time event.
 * Returns { conversationId, messageId }.
 */
async function sendSystemDirectMessage(toUserSub, body, io = null) {
  if (!toUserSub || !body) {
    throw new Error('toUserSub and body are required');
  }

  const systemSub = 'SYSTEM';

  // Ensure a direct conversation between SYSTEM and the user exists (or create it)
  const convoId = await getOrCreateDirectConversation(systemSub, toUserSub);

  // Persist the message
  const messageId = await addMessage(convoId, systemSub, body);

  // Real-time delivery if socket.io instance was supplied
  if (io) {
    const fullMessage = {
      id: messageId,
      conversationId: convoId,
      senderSub: systemSub,
      body,
      sentAt: new Date().toISOString()
    };

    // Emit only to the recipient; SYSTEM does not have a connected socket
    io.to(toUserSub).emit('receive message', fullMessage);
  }

  return { conversationId: convoId, messageId };
}

module.exports = {
  getOrCreateDirectConversation,
  addMessage,
  getConversationMessages,
  getUserConversations,
  markConversationRead,
  getConversationParticipants,
  getOtherParticipant,
  addReaction,
  sendSystemDirectMessage
}; 