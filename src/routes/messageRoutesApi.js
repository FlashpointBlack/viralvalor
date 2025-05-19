console.log('[MESSAGE_ROUTES_API ENTRY] File loaded.');

const express = require('express');
const router = express.Router();
const {
  getOrCreateDirectConversation,
  addMessage,
  getConversationMessages,
  getUserConversations,
  markConversationRead,
  getOtherParticipant,
  sendSystemDirectMessage
} = require('../../messageOperations');
const { dbPromise } = require('../../db');

// Middleware to ensure userSub is present (expects it on req.body or req.query)
function requireUserSub(req, res, next) {
  let userSub =
    req.query.userSub ||
    req.body.userSub ||
    req.headers['x-user-sub'] ||
    (req.oidc && req.oidc.user && req.oidc.user.sub);

  // Sanitize: if userSub is the literal string "undefined" or "null", treat as missing
  if (userSub === 'undefined' || userSub === 'null') {
    userSub = null;
  }

  if (!userSub) {
    return res.status(400).json({ error: 'userSub is required or was invalid (e.g., "undefined")' });
  }
  req.userSub = userSub;
  next();
}

console.log('[MESSAGE_ROUTES_API]: Defining GET /conversations route...');
router.get('/conversations', requireUserSub, async (req, res) => {
  console.log(`[MESSAGE_ROUTES_API HANDLER]: GET /conversations reached. userSub: ${req.userSub}`);
  try {
    const conversations = await getUserConversations(req.userSub);
    // enrich with other participant for direct chats
    const enriched = await Promise.all(conversations.map(async c => {
      if (!c.isGroup) {
        let other = await getOtherParticipant(c.conversationId, req.userSub);
        if (!other) {
          other = { name: 'You', sub: req.userSub };
        }
        return { ...c, other };
      }
      return c;
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[MESSAGE_ROUTES_API HANDLER ERROR] Error fetching conversations:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
console.log('[MESSAGE_ROUTES_API]: GET /conversations route defined.');

// Get or create direct conversation between two users
router.post('/conversations/direct', async (req, res) => {
  const { userSubA, userSubB } = req.body;
  if (!userSubA || !userSubB) {
    return res.status(400).json({ error: 'userSubA and userSubB are required' });
  }
  try {
    const convoId = await getOrCreateDirectConversation(userSubA, userSubB);
    res.json({ conversationId: convoId });
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Fetch messages for a conversation (optional pagination)
router.get('/conversations/:id/messages', requireUserSub, async (req, res) => {
  const { id } = req.params;
  const { beforeId, limit } = req.query;
  try {
    const msgs = await getConversationMessages(id, limit || 50, beforeId);
    res.json(msgs);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a new message
router.post('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { senderSub, body } = req.body;
  if (!senderSub || !body) {
    return res.status(400).json({ error: 'senderSub and body are required' });
  }
  try {
    const msgId = await addMessage(id, senderSub, body);
    res.json({ messageId: msgId });
  } catch (err) {
    console.error('Error adding message:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark conversation as read
router.post('/conversations/:id/read', async (req, res) => {
  const { id } = req.params;
  const { userSub, lastMessageId } = req.body;
  if (!userSub || !lastMessageId) {
    return res.status(400).json({ error: 'userSub and lastMessageId required' });
  }
  try {
    await markConversationRead(id, userSub, lastMessageId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking read:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add admin endpoint to broadcast system messages to user groups
// This will be mounted under /api/messages/admin/system-messages if the router is mounted at /api/messages
// Or /api/admin/system-messages if this router is mounted at /api and the admin route is not nested.
// For now, keeping the path as is internally.
router.post('/admin/system-messages', async (req, res) => {
  try {
    const requestSub = (req.oidc && req.oidc.user && req.oidc.user.sub) || req.headers['x-user-sub'];
    if (!requestSub) return res.status(401).json({ error: 'Unauthorized' });

    // Verify requester is admin
    const [adminRows] = await dbPromise.query('SELECT isadmin FROM UserAccounts WHERE auth0_sub = ? LIMIT 1', [requestSub]);
    if (!adminRows.length || adminRows[0].isadmin !== 1) {
      return res.status(403).json({ error: 'Only admins may send system messages' });
    }

    const { body, groups } = req.body;
    if (!body || !groups || !Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ error: 'body and groups[] are required' });
    }

    // Determine filters per clarified rules
    const adminSelected = {
      admins: groups.includes('admins'),
      nonAdmins: groups.includes('nonAdmins')
    };
    const roleSelected = {
      educators: groups.includes('educators'),
      students: groups.includes('students')
    };

    // Admin filter: only apply if exactly one of the two in the pair selected
    let adminFilter = null;
    if (adminSelected.admins ^ adminSelected.nonAdmins) {
      adminFilter = adminSelected.admins ? 'isadmin = 1' : 'isadmin = 0';
    }

    // Role filter (educator vs student)
    let roleFilter = null;
    if (roleSelected.educators ^ roleSelected.students) {
      roleFilter = roleSelected.educators ? 'iseducator = 1' : 'iseducator = 0';
    }

    // Build final WHERE clauses
    const whereClauses = [];
    if (adminFilter) whereClauses.push(adminFilter);
    if (roleFilter) whereClauses.push(roleFilter);

    // If no specific filter applied (e.g., both or none of each pair), it means broadcast to all (minus SYSTEM)
    let whereSQL = 'auth0_sub IS NOT NULL AND auth0_sub <> \'SYSTEM\'';
    if (whereClauses.length) {
      whereSQL = `${whereSQL} AND (${whereClauses.join(' AND ')})`;
    }

    const query = `SELECT DISTINCT auth0_sub AS sub FROM UserAccounts WHERE ${whereSQL}`;
    const [targetRows] = await dbPromise.query(query);

    if (!targetRows.length) {
      return res.status(200).json({ message: 'No users matched selected groups', count: 0 });
    }

    const io = req.app.get('io');

    // Send message to each user sequentially (can be parallel but sequential avoids DB thrash)
    for (const row of targetRows) {
      try {
        await sendSystemDirectMessage(row.sub, body, io);
      } catch (err) {
        console.error(`Failed to send system message to ${row.sub}:`, err);
      }
    }

    res.json({ success: true, count: targetRows.length });
  } catch (err) {
    console.error('Error in /admin/system-messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 